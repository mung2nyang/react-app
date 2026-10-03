-- 10-S-1: 일반 사용자는 자기 차량의 미사용 초대만 만든다. 2026-10-03 라이브 적용·검증.
-- 0017 다음 0018 적용. 기존 데이터 삭제 없음. 같은 파일 전체를 한 번에 실행.
begin;

-- RLS의 vehicles -> driver_links 재귀를 피한다. 호출자 본인 소유 여부만 반환.
create or replace function public.owns_driver_link_vehicle(p_vehicle_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.vehicles
    where id = p_vehicle_id and user_id = auth.uid());
$$;
revoke all on function public.owns_driver_link_vehicle(uuid) from public, anon;
grant execute on function public.owns_driver_link_vehicle(uuid) to authenticated;

alter table public.driver_links enable row level security;
drop policy if exists "차주만 초대 생성" on public.driver_links;
create policy "차주만 초대 생성" on public.driver_links for insert to authenticated
with check (
  owner_id = auth.uid() and public.owns_driver_link_vehicle(vehicle_id)
  and status = 'pending' and driver_id is null
  and unlink_requested_by is null and unlink_requested_at is null
);
drop policy if exists "차주만 초대 수정" on public.driver_links;
create policy "차주만 초대 수정" on public.driver_links for update to authenticated
using (owner_id = auth.uid() and public.owns_driver_link_vehicle(vehicle_id))
with check (owner_id = auth.uid() and public.owns_driver_link_vehicle(vehicle_id));

-- SECURITY INVOKER 유지: definer로 바꾸면 current_user 검사가 무력화된다.
create or replace function public.guard_driver_link_unlink()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  -- 실제 서버에서 확인한 내부 RPC 소유자는 postgres. 표시만 흉내 내면 거절.
  if tg_op = 'UPDATE' and current_user = 'postgres'
     and coalesce(current_setting('app.driver_link_internal', true), '') = 'on' then
    return new;
  end if;
  if auth.uid() is null or new.owner_id is distinct from auth.uid()
     or not public.owns_driver_link_vehicle(new.vehicle_id) then
    raise exception '본인 소유 차량만 초대할 수 있습니다.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending' or new.driver_id is not null
       or new.unlink_requested_by is not null or new.unlink_requested_at is not null then
      raise exception '기사 미지정 대기 초대만 만들 수 있습니다.' using errcode = '42501';
    end if;
  else
    if old.owner_id is distinct from auth.uid()
       or not public.owns_driver_link_vehicle(old.vehicle_id)
       or new.id is distinct from old.id
       or new.owner_id is distinct from old.owner_id
       or new.driver_id is distinct from old.driver_id
       or new.status is distinct from old.status
       or (old.status is distinct from 'pending' and new.vehicle_id is distinct from old.vehicle_id)
       or new.unlink_requested_by is distinct from old.unlink_requested_by
       or new.unlink_requested_at is distinct from old.unlink_requested_at then
      raise exception '연동 상태와 해제 요청은 전용 기능으로만 바꿀 수 있습니다.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_driver_link_unlink() from public, anon, authenticated;
drop trigger if exists driver_links_guard_unlink on public.driver_links;
create trigger driver_links_guard_unlink before insert or update on public.driver_links
for each row execute function public.guard_driver_link_unlink();

create or replace function public.redeem_driver_invite_code(p_invite_code text)
returns setof public.driver_links
language plpgsql security definer set search_path = public
as $$
declare
  v_driver uuid := auth.uid();
  v_link public.driver_links;
  v_owner uuid;
  v_previous text := coalesce(current_setting('app.driver_link_internal', true), 'off');
begin
  if v_driver is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  if p_invite_code is null or btrim(p_invite_code) = '' then
    raise exception '초대코드를 입력해 주세요.' using errcode = '22023';
  end if;
  -- 동일 기사가 다른 초대를 동시에 수락해도 한 건만 연결된다.
  perform 1 from public.profiles where id = v_driver for update;
  if not found then
    raise exception '먼저 본인 정보를 등록해 주세요.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.driver_links where driver_id = v_driver and status = 'linked') then
    raise exception '이미 다른 차주에 연동된 계정입니다.' using errcode = 'P0001';
  end if;
  select * into v_link from public.driver_links
    where invite_code = p_invite_code and status = 'pending' and driver_id is null for update;
  if not found then
    raise exception '초대코드를 찾을 수 없거나 이미 사용됐습니다.' using errcode = 'P0002';
  end if;
  -- 차량도 잠가 소유 변경 및 같은 차량의 서로 다른 초대 동시 수락을 직렬화.
  select user_id into v_owner from public.vehicles where id = v_link.vehicle_id for update;
  if not found or v_owner is distinct from v_link.owner_id
     or v_link.unlink_requested_by is not null or v_link.unlink_requested_at is not null then
    raise exception '유효하지 않은 차량 초대입니다.' using errcode = '42501';
  end if;
  if exists (select 1 from public.driver_links where vehicle_id = v_link.vehicle_id and status = 'linked') then
    raise exception '이미 기사가 연동된 차량입니다.' using errcode = 'P0001';
  end if;
  perform set_config('app.driver_link_internal', 'on', true);
  return query update public.driver_links
    set driver_id = v_driver, status = 'linked', updated_at = now()
    where id = v_link.id returning *;
  perform set_config('app.driver_link_internal', v_previous, true);
exception when others then
  perform set_config('app.driver_link_internal', v_previous, true);
  raise;
end;
$$;
revoke all on function public.redeem_driver_invite_code(text) from public, anon;
grant execute on function public.redeem_driver_invite_code(text) to authenticated;
commit;

-- 사후 SELECT 기대: INSERT OR UPDATE, 소유 확인·pending·미지정 조건 포함.
select pg_get_triggerdef(oid) from pg_trigger
where tgrelid = 'public.driver_links'::regclass and tgname = 'driver_links_guard_unlink';
select policyname, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'driver_links' and cmd in ('INSERT', 'UPDATE');
-- 내부 RPC/새 함수 소유자는 postgres여야 한다. 기존 취약 정책으로 자동 되돌리지 않는다.
select proname, pg_get_userbyid(proowner) as owner, prosecdef, proconfig from pg_proc
where pronamespace = 'public'::regnamespace and proname in
  ('owns_driver_link_vehicle', 'guard_driver_link_unlink', 'redeem_driver_invite_code');
