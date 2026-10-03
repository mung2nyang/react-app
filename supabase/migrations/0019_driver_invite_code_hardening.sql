-- 10-S-2: 초대코드 10자리 형식·7일 만료·수락 실패 횟수 제한. 0017·0018 다음에 적용.
-- 기존 대기 초대는 만료 칸이 비어 있어 바로 만료된다(차주가 [코드 생성]으로 재발급). 데이터 삭제 없음.
-- 같은 파일 전체를 한 번에 실행. 다시 실행해도 안전(멱등).
begin;

alter table public.driver_links add column if not exists invite_expires_at timestamptz;

-- 코드 형식과 기한은 서버가 정한다. 화면이 보낸 기한 값은 무시한다.
create or replace function public.guard_driver_link_invite_code()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  -- 0017과 같은 내부 경로(수락·해제 RPC)는 코드·기한을 건드리지 않는다.
  if tg_op = 'UPDATE' and current_user = 'postgres'
     and coalesce(current_setting('app.driver_link_internal', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' or new.invite_code is distinct from old.invite_code then
    if new.invite_code is null
       or new.invite_code !~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$' then
      raise exception '초대코드는 [코드 생성]으로 만든 10자리여야 합니다.' using errcode = '42501';
    end if;
    new.invite_expires_at := now() + interval '7 days';
  else
    new.invite_expires_at := old.invite_expires_at;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_driver_link_invite_code() from public, anon, authenticated;
drop trigger if exists driver_links_guard_invite_code on public.driver_links;
create trigger driver_links_guard_invite_code before insert or update on public.driver_links
for each row execute function public.guard_driver_link_invite_code();

-- 수락 실패 기록(보리 승인 §7). 정책 없음 = 수락 함수만 읽고 쓴다. 하루 지난 기록은 함수가 지운다.
create table if not exists public.driver_invite_redeem_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists driver_invite_redeem_attempts_user_time
  on public.driver_invite_redeem_attempts (user_id, attempted_at);
alter table public.driver_invite_redeem_attempts enable row level security;
revoke all on public.driver_invite_redeem_attempts from public, anon, authenticated;

create or replace function public.redeem_driver_invite_code(p_invite_code text)
returns setof public.driver_links
language plpgsql security definer set search_path = public
as $$
declare
  v_driver uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_invite_code, ''), '[^0-9A-Za-z]', '', 'g'));
  v_link public.driver_links;
  v_owner uuid;
  v_previous text := coalesce(current_setting('app.driver_link_internal', true), 'off');
begin
  if v_driver is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  if v_code = '' then
    raise exception '초대코드를 입력해 주세요.' using errcode = '22023';
  end if;
  -- 동일 기사의 수락 시도를 줄 세워 실패 횟수 계산과 중복 수락을 막는다.
  perform 1 from public.profiles where id = v_driver for update;
  if not found then
    raise exception '먼저 본인 정보를 등록해 주세요.' using errcode = 'P0001';
  end if;
  delete from public.driver_invite_redeem_attempts
    where user_id = v_driver and attempted_at < now() - interval '1 day';
  if (select count(*) from public.driver_invite_redeem_attempts
        where user_id = v_driver and attempted_at > now() - interval '10 minutes') >= 5
     or (select count(*) from public.driver_invite_redeem_attempts where user_id = v_driver) >= 20 then
    raise exception '초대코드를 여러 번 틀렸습니다. 잠시 후 다시 시도해 주세요.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.driver_links where driver_id = v_driver and status = 'linked') then
    raise exception '이미 다른 차주에 연동된 계정입니다.' using errcode = 'P0001';
  end if;
  select * into v_link from public.driver_links
    where invite_code = v_code and status = 'pending' and driver_id is null
      and invite_expires_at > now()
    for update;
  if not found then
    -- 오류로 끝내면 실패 기록도 되돌려지므로 빈 결과로 돌려준다(화면이 안내 문구로 바꿈).
    insert into public.driver_invite_redeem_attempts(user_id) values (v_driver);
    return;
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

-- 사후 SELECT 기대: 트리거 2개(guard_invite_code·guard_unlink), 시도 표 RLS 켜짐·정책 0개·일반 권한 없음,
-- 수락 함수 postgres 소유·definer·search_path=public, 대기 초대는 전부 만료(기한 없음).
select tgname from pg_trigger
where tgrelid = 'public.driver_links'::regclass and not tgisinternal order by 1;
select c.relrowsecurity as rls_on,
       (select count(*) from pg_policies where schemaname = 'public'
          and tablename = 'driver_invite_redeem_attempts') as policies,
       has_table_privilege('authenticated', c.oid, 'select') as authenticated_select,
       has_table_privilege('anon', c.oid, 'select') as anon_select
from pg_class c where c.oid = 'public.driver_invite_redeem_attempts'::regclass;
select proname, pg_get_userbyid(proowner) as owner, prosecdef, proconfig,
       has_function_privilege('anon', oid, 'execute') as anon_exec
from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('redeem_driver_invite_code', 'guard_driver_link_invite_code');
select status, count(*) as total, count(*) filter (where invite_expires_at > now()) as usable
from public.driver_links group by status order by 1;
