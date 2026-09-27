-- 0007: get_assigned_vehicle_summary 에 기사 유형·원천징수·필요경비율·산재보험료율 4개 컬럼 추가.
-- 소속기사 본인 매출 화면이 차주 화면과 같은 방식(domain/driverIncomeDeductions.js)으로
-- 산재보험료·3.3% 세금을 계산하려면 이 4개 값이 필요하다. vehicles.raw(jsonb)에 이미
-- 들어 있으므로(로드맵 4-2 슬라이스 1) 새 칸 없이 읽어서 돌려준다.
-- 기본값 계산(비었을 때 30.5%/1.8%/사업소득자/꺼짐)은 SQL에 넣지 않는다 — JS
-- domain/driverIncomeDeductions.js가 이미 하는 일이라 정본을 하나만 유지한다.
-- driver_income_type/expense_rate/insurance_rate는 텍스트를 그대로 통과시키고
-- (JS가 이상한 값을 기본값으로 되돌림), withholding_on만 0006의 insurance_on과
-- 같은 방식으로 boolean 타입을 방어한다(잘못된 값이면 함수 전체가 에러 나지 않게).
-- 0006 함수의 반환 목록 끝에 4개만 더한다(기존 11개 컬럼·순서 불변).
begin;

drop function if exists public.get_assigned_vehicle_summary();
create or replace function public.get_assigned_vehicle_summary()
returns table (
  id uuid,
  number text,
  type text,
  tonnage text,
  settlement_mode text,
  driver_pay_mode text,
  driver_salary_amount numeric,
  comm_enabled boolean,
  comm_type text,
  comm_value text,
  insurance_on boolean,
  driver_income_type text,
  withholding_on boolean,
  expense_rate text,
  insurance_rate text
)
language sql
security definer
set search_path = public
as $$
  select v.id, v.number, v.type, v.tonnage, v.settlement_mode,
         v.driver_pay_mode, v.driver_salary_amount,
         v.comm_enabled, v.comm_type, v.comm_value,
         case when jsonb_typeof(v.raw -> 'insuranceOn') = 'boolean'
              then (v.raw ->> 'insuranceOn')::boolean
              else false end,
         v.raw ->> 'driverIncomeType',
         case when jsonb_typeof(v.raw -> 'withholdingOn') = 'boolean'
              then (v.raw ->> 'withholdingOn')::boolean
              else false end,
         v.raw ->> 'expenseRate',
         v.raw ->> 'insuranceRate'
  from public.vehicles v
  join public.driver_links dl on dl.vehicle_id = v.id
  where dl.driver_id = auth.uid() and dl.status = 'linked';
$$;

revoke all on function public.get_assigned_vehicle_summary() from public;
revoke execute on function public.get_assigned_vehicle_summary() from anon;
grant execute on function public.get_assigned_vehicle_summary() to authenticated;

commit;
