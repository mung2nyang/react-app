-- 0028: 그날 하루 기록 줄 저장과 콜 상세 바꾸기를 함수 한 번(= 한 트랜잭션)으로 — 콜 바꾸기가 실패하면 하루 기록 줄도 저장 전으로 돌아간다.
-- security invoker: 운행기록·콜상세 권한과 작성자 칸 트리거(0027) 그대로. 표 변경 없음, create or replace라 다시 실행해도 안전.

begin;

create or replace function public.save_day_log(p_log jsonb, p_rows jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.daily_logs;
  v_id uuid;
begin
  if jsonb_typeof(p_log) is distinct from 'object' then
    raise exception 'p_log는 객체여야 합니다.' using errcode = 'P0001';
  end if;
  r := jsonb_populate_record(null::public.daily_logs, p_log);

  insert into public.daily_logs (user_id, vehicle_id, work_date, is_off, fixed_count, pallet_count, raw)
  values (r.user_id, r.vehicle_id, r.work_date, r.is_off, r.fixed_count, r.pallet_count, r.raw)
  on conflict (vehicle_id, work_date) do update
    set user_id = excluded.user_id, is_off = excluded.is_off, fixed_count = excluded.fixed_count,
        pallet_count = excluded.pallet_count, raw = excluded.raw
  returning id into v_id;

  perform public.replace_transport_details(v_id, p_rows);
  return v_id;
end;
$$;

revoke all on function public.save_day_log(jsonb, jsonb) from public, anon;
grant execute on function public.save_day_log(jsonb, jsonb) to authenticated;

commit;

-- 사후검증 1(기대: 1줄, security_definer = false, proconfig = {search_path=public}, anon_exec = false, auth_exec = true)
-- select p.proname, p.prosecdef as security_definer, p.proconfig,
--        has_function_privilege('anon', p.oid, 'execute') as anon_exec,
--        has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
-- from pg_proc p where p.proname = 'save_day_log';

-- 되돌리기(앱을 먼저 되돌린 뒤): drop function if exists public.save_day_log(jsonb, jsonb);
