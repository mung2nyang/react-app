-- 0002_driver_invite_redeem.sql
-- 기사 본인이 초대코드로 driver_links 행에 스스로를 연결하는 RPC + 연동 후
-- 필요한 최소 읽기 RLS. 기사 화면(매출)이 실제로 쓰는 테이블만 연다 — 정비/
-- 주유/기타비용/세금계산서는 기사 화면에 없으므로 열지 않는다(최소 권한).

begin;

-- 2026-09-03 정정(4차): 보리의 첫 실행 시도(문법 오류로 중단됐던 그 실행)에서
-- 이 함수까지는 이미 만들어져서 DB에 남아 있었던 것으로 보인다 — Supabase SQL
-- 에디터가 `begin;`/`commit;`을 문서에 쓴 그대로 하나의 원자적 트랜잭션으로
-- 처리하지 않을 수 있다는 뜻이다(커넥션 풀러가 트랜잭션 모드일 때 흔한 문제).
-- 즉 "중간에 에러 나면 전부 롤백된다"는 이전 감시관의 설명은 틀렸다 — 재실행
-- 시 이전 실행에서 이미 만들어진 오브젝트와 충돌할 수 있으므로, 아래처럼 함수는
-- 전부 `drop function if exists` 먼저 하고 `create`하는 방식으로 바꿔 재실행해도
-- 항상 안전하게(멱등하게) 만든다.
-- 1) redeem RPC. security definer 필수 — 이 시점 기사는 그 driver_links 행의
--    owner_id도 driver_id도 자기 자신이 아니라 일반 RLS로는 SELECT조차 안 된다.
drop function if exists public.redeem_driver_invite_code(text);
create or replace function public.redeem_driver_invite_code(
  p_invite_code text
) returns setof public.driver_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid := auth.uid();
begin
  if v_driver_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;
  if p_invite_code is null or btrim(p_invite_code) = '' then
    raise exception '초대코드를 입력해 주세요.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.driver_links
    where driver_id = v_driver_id and status = 'linked'
  ) then
    raise exception '이미 다른 차주에 연동된 계정입니다.' using errcode = 'P0001';
  end if;

  return query
  update public.driver_links
  set driver_id = v_driver_id, status = 'linked', updated_at = now()
  where invite_code = p_invite_code
    and status = 'pending'
    and driver_id is null
  returning *;

  if not found then
    raise exception '초대코드를 찾을 수 없거나 이미 사용됐습니다.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.redeem_driver_invite_code(text) from public;
revoke execute on function public.redeem_driver_invite_code(text) from anon;
grant execute on function public.redeem_driver_invite_code(text) to authenticated;

-- 2026-09-03 정정: Postgres는 `CREATE POLICY`에 `IF NOT EXISTS`를 지원하지
-- 않는다(테이블/인덱스와 다름) — 보리가 실행 중 문법 오류로 발견. 아래부터는
-- 전부 `drop policy if exists` + `create policy`로 고쳤다(재실행해도 안전).
-- 2) 기사 본인이 "내가 연동된 차주가 누구인지" 부트 시점에 조회 — 자기 행만.
drop policy if exists "driver reads own driver_links row" on public.driver_links;
create policy "driver reads own driver_links row"
  on public.driver_links for select
  using (driver_id = auth.uid());

-- 3) 연동된 기사가 자신에게 배정된 차량 정보를 읽을 수 있어야 한다(최소 권한).
-- 2026-09-03 정정(2차): 처음엔 owner_id 기준 블랭킷 정책 → driver_links.vehicle_id
-- 기준으로 좁혔었는데, 보리가 `vehicles.raw`(jsonb)의 키 목록을 직접 확인해 준
-- 결과 `businessInfo`/`personalInfo`처럼 내용을 알 수 없는 중첩 필드가 들어있는
-- 게 드러났다 — 이게 실제로 누구(차주 자신? 다른 사람?)의 정보인지 코드만 봐선
-- 확인 불가. `vehicles`는 이미 `driver_bank_name`/`driver_account_number`/
-- `driver_business_number`/`driver_salary_amount`도 같이 있는 테이블이라
-- `profiles`와 같은 문제 — 행 단위 정책으로 전체 컬럼(raw 포함)을 열면 안
-- 되고, 대신 화면에 실제로 필요한 안전한 컬럼만 골라주는 함수로 제한한다.
drop function if exists public.get_assigned_vehicle_summary();
create or replace function public.get_assigned_vehicle_summary()
returns table (
  id uuid,
  number text,
  type text,
  tonnage text,
  settlement_mode text,
  driver_pay_mode text,
  driver_salary_amount numeric
)
language sql
security definer
set search_path = public
as $$
  select v.id, v.number, v.type, v.tonnage, v.settlement_mode,
         v.driver_pay_mode, v.driver_salary_amount
  from public.vehicles v
  join public.driver_links dl on dl.vehicle_id = v.id
  where dl.driver_id = auth.uid() and dl.status = 'linked';
$$;

revoke all on function public.get_assigned_vehicle_summary() from public;
revoke execute on function public.get_assigned_vehicle_summary() from anon;
grant execute on function public.get_assigned_vehicle_summary() to authenticated;
-- (기존 "linked driver reads own assigned vehicle" 행단위 정책은 추가하지 않는다
-- — vehicles에 대한 일반 SELECT 경로는 employed_driver 세션엔 열려 있지 않다.)

-- 2026-09-03 정정: `profiles`는 bank_name/account_number/business_number 같은
-- 민감 컬럼이 같이 있어서 행 단위 SELECT를 열면 기사에게 차주 계좌번호까지
-- 노출된다. RLS는 컬럼 단위로 못 막고(GRANT SELECT(cols)는 authenticated 역할
-- 전체에 적용돼 차주 본인 읽기까지 막아버림), 그래서 `profiles`엔 정책을 아예
-- 추가하지 않고, 기사에게 필요한 값(이름·상호명·매출계산용 settings)만 골라
-- 돌려주는 별도 함수로 대체한다. 클라이언트(employed_driver 세션)는 이 함수를
-- 호출해야 한다 — 일반 `profiles.select('*')` 경로를 그대로 타면 안 된다.
drop function if exists public.get_linked_owner_profile_settings(uuid);
create or replace function public.get_linked_owner_profile_settings(
  p_owner_id uuid
) returns table (name text, business_name text, settings jsonb)
language sql
security definer
set search_path = public
as $$
  select p.name, p.business_name, p.settings
  from public.profiles p
  where p.id = p_owner_id
    and exists (
      select 1 from public.driver_links dl
      where dl.owner_id = p_owner_id
        and dl.driver_id = auth.uid()
        and dl.status = 'linked'
    );
$$;

revoke all on function public.get_linked_owner_profile_settings(uuid) from public;
revoke execute on function public.get_linked_owner_profile_settings(uuid) from anon;
grant execute on function public.get_linked_owner_profile_settings(uuid) to authenticated;

-- 2026-09-03 정정: `clients`엔 biz_number/payment_term/payment_term_value/
-- raw(jsonb, 용도 불명) 등 owner 업무상 민감한 필드가 섞여 있고, 기사 화면
-- (매출)이 실제로 clients 테이블을 쓰는지 코드로 확인되지 않았다 — 필요성이
-- 확인되기 전까지 정책을 아예 추가하지 않는다(최소 권한). 나중에 필요해지면
-- 안전한 필드만 골라주는 함수로 추가한다.
-- (기존 "linked driver reads owner clients" 정책 삭제)

-- 2026-09-03 정정: daily_logs/transport_details도 vehicles와 같은 이유로
-- "연동된 차주의 모든 차량"이 아니라 `driver_links.vehicle_id`(본인 배정
-- 차량)로 좁힌다 — 그래야 같은 차주 밑 다른 하위기사의 운행일지가 안 보인다.
drop policy if exists "linked driver reads own assigned vehicle daily_logs" on public.daily_logs;
create policy "linked driver reads own assigned vehicle daily_logs"
  on public.daily_logs for select
  using (vehicle_id in (
    select vehicle_id from public.driver_links
    where driver_id = auth.uid() and status = 'linked' and vehicle_id is not null
  ));

drop policy if exists "linked driver reads own assigned vehicle transport_details" on public.transport_details;
create policy "linked driver reads own assigned vehicle transport_details"
  on public.transport_details for select
  using (vehicle_id in (
    select vehicle_id from public.driver_links
    where driver_id = auth.uid() and status = 'linked' and vehicle_id is not null
  ));

commit;
