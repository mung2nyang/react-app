-- 10-S-1: 유효한 현재 연동 + 실제 차량 소유자 일치. 2026-10-03 라이브 적용·검증(0017 다음).
begin;

-- definer로 테이블 정책 간 재귀를 끊는다. 로그인한 기사 본인 관계만 검사.
create or replace function public.driver_has_valid_vehicle_link(p_vehicle_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.driver_links dl
    join public.vehicles v on v.id = dl.vehicle_id and v.user_id = dl.owner_id
    where dl.vehicle_id = p_vehicle_id and dl.driver_id = auth.uid() and dl.status = 'linked');
$$;
revoke all on function public.driver_has_valid_vehicle_link(uuid) from public, anon;
grant execute on function public.driver_has_valid_vehicle_link(uuid) to authenticated;

create or replace function public.driver_can_access_vehicle_date(p_vehicle_id uuid, p_work_date date)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.driver_has_valid_vehicle_link(p_vehicle_id)
    and exists (select 1 from public.driver_links dl
      join public.vehicles v on v.id = dl.vehicle_id and v.user_id = dl.owner_id
      where dl.vehicle_id = p_vehicle_id and dl.driver_id = auth.uid()
        and dl.status in ('linked', 'disconnected')
        and (dl.assignment_start is null or p_work_date >= dl.assignment_start)
        and (dl.assignment_end is null or p_work_date <= dl.assignment_end));
$$;
revoke all on function public.driver_can_access_vehicle_date(uuid, date) from public, anon;
grant execute on function public.driver_can_access_vehicle_date(uuid, date) to authenticated;

create or replace function public.has_linked_profile_access(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.driver_links dl
    join public.vehicles v on v.id = dl.vehicle_id and v.user_id = dl.owner_id
    where dl.status = 'linked' and (
      (dl.owner_id = auth.uid() and dl.driver_id = p_profile_id)
      or (dl.driver_id = auth.uid() and dl.owner_id = p_profile_id)));
$$;
revoke all on function public.has_linked_profile_access(uuid) from public, anon;
grant execute on function public.has_linked_profile_access(uuid) to authenticated;

alter table public.vehicles enable row level security;
alter table public.profiles enable row level security;
drop policy if exists "차량 조회" on public.vehicles;
create policy "차량 조회" on public.vehicles for select to authenticated
using (user_id = auth.uid() or public.driver_has_valid_vehicle_link(id));
drop policy if exists "본인 프로필 조회" on public.profiles;
create policy "본인 프로필 조회" on public.profiles for select to authenticated
using (id = auth.uid() or public.has_linked_profile_access(id));

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
commit;

-- 사후 SELECT: 두 정책에 위 보조 함수가 표시되고, 아래 anon=false/authenticated=true.
select tablename, policyname, roles, qual from pg_policies where schemaname = 'public'
and ((tablename = 'vehicles' and policyname = '차량 조회')
  or (tablename = 'profiles' and policyname = '본인 프로필 조회'));
select p.proname, p.prosecdef, p.proconfig,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in
  ('driver_has_valid_vehicle_link', 'driver_can_access_vehicle_date',
   'has_linked_profile_access', 'delete_own_account');
-- 기대 0. 0이 아니면 기존 데이터 임의 삭제 없이 추가 조사.
select count(*) as invalid_links from public.driver_links dl
left join public.vehicles v on v.id = dl.vehicle_id where dl.owner_id is distinct from v.user_id;
