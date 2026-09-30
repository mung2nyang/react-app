-- 7-C-1: 연동 해제는 양쪽 동의(차주·기사 중 한쪽 요청 → 상대 동의) 또는 요청 후 3일 경과로만. 해제 시 행을 지우지 않고 disconnected + 종료일로 남긴다.
-- 거절 없음(요청자는 취소 가능). 3일 경과 처리는 앱을 열 때 settle_expired_driver_unlinks()가 한다.
-- 종료일은 한국 날짜(서버 시계는 UTC). 내부 허용 표시(app.driver_link_internal)는 쓰고 나면 바로 끈다(같은 묶음의 다음 문장이 우회하지 못하게).
-- 일반 사용자가 연동 행을 직접 해제 상태로 바꾸거나 요청 칸을 고치거나 linked 행을 지우는 우회는 막는다(트리거 + 삭제 규칙).
-- 2026-09-30 Supabase SQL Editor에서 실행·검증함(AI가 사용자 지시로 실행). 멱등. 데이터 변경 없음.
-- 7-D: disconnect_driver_link_internal에 기사 쪽 기록 복사를 붙인다.

begin;

alter table public.driver_links add column if not exists unlink_requested_by uuid references public.profiles(id) on delete set null;
alter table public.driver_links add column if not exists unlink_requested_at timestamptz;

create or replace function public.disconnect_driver_link_internal(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.driver_link_internal', 'on', true);
  update public.driver_links
     set status = 'disconnected', assignment_end = (now() at time zone 'Asia/Seoul')::date,
         unlink_requested_by = null, unlink_requested_at = null, updated_at = now()
   where id = p_link_id and status = 'linked';
  perform set_config('app.driver_link_internal', 'off', true);
end;
$$;
revoke all on function public.disconnect_driver_link_internal(uuid) from public;
revoke execute on function public.disconnect_driver_link_internal(uuid) from anon, authenticated;

create or replace function public.request_driver_unlink(p_link_id uuid)
returns setof public.driver_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.driver_links;
begin
  select * into v from public.driver_links
   where id = p_link_id and status = 'linked' and (owner_id = auth.uid() or driver_id = auth.uid())
   for update;
  if not found then
    raise exception '연동 정보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if v.unlink_requested_by is not null and v.unlink_requested_by <> auth.uid() then
    perform public.disconnect_driver_link_internal(p_link_id);
  elsif v.unlink_requested_by is null then
    perform set_config('app.driver_link_internal', 'on', true);
    update public.driver_links
       set unlink_requested_by = auth.uid(), unlink_requested_at = now(), updated_at = now()
     where id = p_link_id;
    perform set_config('app.driver_link_internal', 'off', true);
  end if;
  return query select * from public.driver_links where id = p_link_id;
end;
$$;

create or replace function public.consent_driver_unlink(p_link_id uuid)
returns setof public.driver_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.driver_links;
begin
  select * into v from public.driver_links
   where id = p_link_id and status = 'linked' and (owner_id = auth.uid() or driver_id = auth.uid())
   for update;
  if not found or v.unlink_requested_by is null or v.unlink_requested_by = auth.uid() then
    raise exception '동의할 해제 요청이 없습니다.' using errcode = 'P0002';
  end if;
  perform public.disconnect_driver_link_internal(p_link_id);
  return query select * from public.driver_links where id = p_link_id;
end;
$$;

create or replace function public.cancel_driver_unlink(p_link_id uuid)
returns setof public.driver_links
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.driver_link_internal', 'on', true);
  update public.driver_links
     set unlink_requested_by = null, unlink_requested_at = null, updated_at = now()
   where id = p_link_id and status = 'linked' and unlink_requested_by = auth.uid();
  if not found then
    perform set_config('app.driver_link_internal', 'off', true);
    raise exception '취소할 해제 요청이 없습니다.' using errcode = 'P0002';
  end if;
  perform set_config('app.driver_link_internal', 'off', true);
  return query select * from public.driver_links where id = p_link_id;
end;
$$;

create or replace function public.settle_expired_driver_unlinks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id from public.driver_links
     where status = 'linked' and unlink_requested_at is not null
       and unlink_requested_at < now() - interval '3 days'
       and (owner_id = auth.uid() or driver_id = auth.uid())
     for update
  loop
    perform public.disconnect_driver_link_internal(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.request_driver_unlink(uuid) from public;
revoke all on function public.consent_driver_unlink(uuid) from public;
revoke all on function public.cancel_driver_unlink(uuid) from public;
revoke all on function public.settle_expired_driver_unlinks() from public;
revoke execute on function public.request_driver_unlink(uuid) from anon;
revoke execute on function public.consent_driver_unlink(uuid) from anon;
revoke execute on function public.cancel_driver_unlink(uuid) from anon;
revoke execute on function public.settle_expired_driver_unlinks() from anon;
grant execute on function public.request_driver_unlink(uuid) to authenticated;
grant execute on function public.consent_driver_unlink(uuid) to authenticated;
grant execute on function public.cancel_driver_unlink(uuid) to authenticated;
grant execute on function public.settle_expired_driver_unlinks() to authenticated;

create or replace function public.guard_driver_link_unlink()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.driver_link_internal', true), '') = 'on' then
    return new;
  end if;
  if old.status = 'linked' and new.status is distinct from 'linked' then
    raise exception '연동 해제는 해제 요청과 동의로만 할 수 있습니다.' using errcode = 'P0001';
  end if;
  if new.unlink_requested_by is distinct from old.unlink_requested_by
     or new.unlink_requested_at is distinct from old.unlink_requested_at then
    raise exception '해제 요청은 해제 요청 기능으로만 바꿀 수 있습니다.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists driver_links_guard_unlink on public.driver_links;
create trigger driver_links_guard_unlink
  before update on public.driver_links
  for each row execute function public.guard_driver_link_unlink();

drop policy if exists "차주만 초대 삭제" on public.driver_links;
create policy "차주만 초대 삭제" on public.driver_links for delete
  using (owner_id = auth.uid() and status is distinct from 'linked');

commit;

-- 사후검증(읽기 전용)
-- select column_name from information_schema.columns where table_schema='public' and table_name='driver_links' and column_name like 'unlink_%';  -- 2행
-- select proname from pg_proc where proname in ('disconnect_driver_link_internal','request_driver_unlink','consent_driver_unlink','cancel_driver_unlink','settle_expired_driver_unlinks','guard_driver_link_unlink');  -- 6행
-- select tgname from pg_trigger where tgname = 'driver_links_guard_unlink';  -- 1행
-- select qual from pg_policies where tablename='driver_links' and policyname='차주만 초대 삭제';  -- status 조건 포함

-- 되돌리기: drop trigger driver_links_guard_unlink; drop function 위 6개;
-- "차주만 초대 삭제"를 using (owner_id = auth.uid())로 다시 만든다. 추가한 두 칸은 남겨 둬도 무해(비어 있음).
