-- 0003: get_assigned_vehicle_summary 에 매출제 정산율 컬럼 추가.
-- 소속기사 매출 화면(D-2)이 본인 정산율(vehicles.comm_value)을 알아야
-- 순이익 = 운송료 × % 를 계산할 수 있다. 0002 함수의 반환 목록에 3개만 더한다.
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
  comm_value text
)
language sql
security definer
set search_path = public
as $$
  select v.id, v.number, v.type, v.tonnage, v.settlement_mode,
         v.driver_pay_mode, v.driver_salary_amount,
         v.comm_enabled, v.comm_type, v.comm_value
  from public.vehicles v
  join public.driver_links dl on dl.vehicle_id = v.id
  where dl.driver_id = auth.uid() and dl.status = 'linked';
$$;

revoke all on function public.get_assigned_vehicle_summary() from public;
revoke execute on function public.get_assigned_vehicle_summary() from anon;
grant execute on function public.get_assigned_vehicle_summary() to authenticated;
