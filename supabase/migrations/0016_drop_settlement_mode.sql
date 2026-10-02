-- 0016: "계산서 처리 방식"(settlement_mode) 칸 삭제 — 세금계산서 정리 ③.
-- 정산 개념은 매출제/월급제뿐이라 이 값은 코드에서 더 이상 쓰지도 읽지도 않는다
-- (코드가 먼저 정리됨). 이 값을 읽는 서버 함수는 get_assigned_vehicle_summary 1개뿐이라
-- settlement_mode 컬럼만 뺀 채 다시 만들고(0007과 같은 권한, 나머지 14칸·순서 그대로),
-- clients의 읽기 규칙 "차주는 기사직접정산 기사의 거래처를 조회 가"(settlement_mode = driver_direct 조건, 서버에 해당 차량 0대)도
-- 이 칸에 기대므로 먼저 지운다(CASCADE 안 씀). 그 뒤 vehicles·driver_links의 칸을 지운다. vehicles.raw 안의 옛 값은 안 읽으므로 그대로 둔다.
begin;

drop function if exists public.get_assigned_vehicle_summary();
create or replace function public.get_assigned_vehicle_summary()
returns table (
  id uuid,
  number text,
  type text,
  tonnage text,
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
  select v.id, v.number, v.type, v.tonnage,
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

drop policy if exists "차주는 기사직접정산 기사의 거래처를 조회 가" on public.clients;

alter table public.vehicles drop column if exists settlement_mode;
alter table public.driver_links drop column if exists settlement_mode;

commit;
