-- 기사 차량 번호 바꾸기(0022)와 나머지 칸 저장을 한 번에 — 둘 다 되거나 하나도 안 됨(함수 하나 = 한 트랜잭션).
-- security invoker: 부르는 사람 권한 그대로(본인 차량 RLS). 표 변경 없음, create or replace라 다시 실행해도 안전. 0022는 옛 앱용으로 남김.
begin;

create or replace function public.rename_and_save_sub_vehicle(p_vehicle_id uuid, p_new_number text, p_row jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.vehicles;
begin
  perform 1 from public.rename_sub_vehicle(p_vehicle_id, p_new_number);
  r := jsonb_populate_record(null::public.vehicles, p_row);
  update public.vehicles v
  set tonnage = r.tonnage,
      display_order = r.display_order,
      comm_enabled = r.comm_enabled,
      comm_type = r.comm_type,
      comm_value = r.comm_value,
      driver_pay_mode = r.driver_pay_mode,
      driver_salary_amount = r.driver_salary_amount,
      driver_link_id = r.driver_link_id,
      driver_name = r.driver_name,
      archived = r.archived,
      raw = r.raw
  where v.id = p_vehicle_id and v.user_id = auth.uid();
  if not found then
    raise exception '차량을 찾지 못했습니다.' using errcode = 'P0001';
  end if;
  return p_vehicle_id;
end;
$$;

revoke all on function public.rename_and_save_sub_vehicle(uuid, text, jsonb) from public, anon;
grant execute on function public.rename_and_save_sub_vehicle(uuid, text, jsonb) to authenticated;

commit;

-- 사후검증(기대: 1줄, security_definer = false, proconfig = {search_path=public}, anon_exec = false, auth_exec = true)
-- select p.proname, p.prosecdef as security_definer, p.proconfig,
--        has_function_privilege('anon', p.oid, 'execute') as anon_exec,
--        has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
-- from pg_proc p where p.proname = 'rename_and_save_sub_vehicle';
