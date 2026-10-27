-- 0030: 빈 날이 된 그 날짜 지우기를 함수 한 번(= 한 트랜잭션)으로 — 콜 상세 지우기·지출 확인·하루 기록 줄 비우기/지우기가 다 되거나 하나도 안 됨.
-- 그날 지출이 있으면 줄을 지우지 않고 빈 기록으로 남긴다(지출 행이 daily_logs에 ON DELETE CASCADE로 묶여 있어서 — 0-3-A 규칙 그대로).
-- security invoker: 운행기록·콜상세·지출 권한과 작성자 칸 트리거(0027) 그대로. 표 변경 없음, create or replace라 다시 실행해도 안전.
begin;

create or replace function public.remove_day_log(p_vehicle_id uuid, p_work_date date)
returns text
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.transport_details where vehicle_id = p_vehicle_id and work_date = p_work_date;
  if exists (select 1 from public.fuel_records where vehicle_id = p_vehicle_id and work_date = p_work_date)
     or exists (select 1 from public.maintenance_records where vehicle_id = p_vehicle_id and work_date = p_work_date)
     or exists (select 1 from public.misc_expense_records where vehicle_id = p_vehicle_id and work_date = p_work_date) then
    update public.daily_logs
    set is_off = false, fixed_count = 0, pallet_count = 0, raw = '{}'::jsonb
    where vehicle_id = p_vehicle_id and work_date = p_work_date;
    return 'blanked';
  end if;
  delete from public.daily_logs where vehicle_id = p_vehicle_id and work_date = p_work_date;
  return 'deleted';
end;
$$;

revoke all on function public.remove_day_log(uuid, date) from public, anon;
grant execute on function public.remove_day_log(uuid, date) to authenticated;

commit;

-- 사후검증(기대: 1줄, security_definer = false, proconfig = {search_path=public}, anon_exec = false, auth_exec = true)
-- select p.proname, p.prosecdef as security_definer, p.proconfig,
--        has_function_privilege('anon', p.oid, 'execute') as anon_exec,
--        has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
-- from pg_proc p where p.proname = 'remove_day_log';

-- 되돌리기(앱을 먼저 되돌린 뒤): drop function if exists public.remove_day_log(uuid, date);
