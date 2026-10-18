-- 0024: 연동 기사 앱에 매출제 기사 몫 기준(로드맵 61, vehicles.raw의 driverShareBase)을 함께 보낸다.
-- get_assigned_vehicle_summary는 0016과 같은 권한·14칸·순서 그대로에 맨 끝 driver_share_base 한 칸만 더한다.
-- 반환 칸이 바뀌므로 지우고 다시 만든다(create or replace는 반환 모양을 못 바꿈). 옛 앱은 새 칸을 무시한다.
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
  insurance_rate text,
  driver_share_base text
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
         v.raw ->> 'insuranceRate',
         v.raw ->> 'driverShareBase'
  from public.vehicles v
  join public.driver_links dl on dl.vehicle_id = v.id
  where dl.driver_id = auth.uid() and dl.status = 'linked';
$$;

revoke all on function public.get_assigned_vehicle_summary() from public;
revoke execute on function public.get_assigned_vehicle_summary() from anon;
grant execute on function public.get_assigned_vehicle_summary() to authenticated;

commit;
