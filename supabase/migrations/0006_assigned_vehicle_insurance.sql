-- 0006: get_assigned_vehicle_summary 에 산재보험 적용 여부(insurance_on) 컬럼 추가.
-- 소속기사 본인 매출 화면이 산재보험료를 정산액에서 차감하려면 배정 차량의
-- 산재 적용 여부를 알아야 한다. 차주가 저장한 값은 vehicles.raw(jsonb)의
-- insuranceOn 에 이미 들어 있으므로 새 칸 없이 읽어서 돌려준다.
-- 0003 함수의 반환 목록 끝에 1개만 더한다(기존 10개 컬럼·순서 불변).
-- raw 에 boolean 이 아닌 값이 있어도 함수 전체가 실패하지 않도록 case 로 방어한다.
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
  insurance_on boolean
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
              else false end
  from public.vehicles v
  join public.driver_links dl on dl.vehicle_id = v.id
  where dl.driver_id = auth.uid() and dl.status = 'linked';
$$;

revoke all on function public.get_assigned_vehicle_summary() from public;
revoke execute on function public.get_assigned_vehicle_summary() from anon;
grant execute on function public.get_assigned_vehicle_summary() to authenticated;

commit;
