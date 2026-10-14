-- 로드맵 69: 그날 콜 상세(transport_details)를 지우기·넣기 두 번이 아니라 함수 한 번(= 한 트랜잭션)으로 바꾼다.
-- 중간에 끊기면 둘 다 안 된 것으로 돌아가 옛 콜이 그대로 남는다.
-- security invoker: 부르는 사람 권한 그대로(콜상세 삭제·작성 RLS — 차주 본인 차량·연동 기사 기간). 표 변경 없음, create or replace라 다시 실행해도 안전.

begin;

create or replace function public.replace_transport_details(p_daily_log_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows는 배열이어야 합니다.' using errcode = 'P0001';
  end if;

  delete from public.transport_details t where t.daily_log_id = p_daily_log_id;

  insert into public.transport_details (
    daily_log_id, user_id, vehicle_id, client_id, work_date, sequence, load_loc, unload_loc,
    fare_amount, vat_exempt, payment_status, payment_due_date, payments, commission_snapshot, raw
  )
  select
    p_daily_log_id, r.user_id, r.vehicle_id, r.client_id, r.work_date, r.sequence, r.load_loc, r.unload_loc,
    r.fare_amount, coalesce(r.vat_exempt, false), coalesce(r.payment_status, '미수'), r.payment_due_date,
    coalesce(r.payments, '[]'::jsonb), r.commission_snapshot, r.raw
  from jsonb_populate_recordset(null::public.transport_details, p_rows) as r;
end;
$$;

revoke all on function public.replace_transport_details(uuid, jsonb) from public, anon;
grant execute on function public.replace_transport_details(uuid, jsonb) to authenticated;

commit;

-- 사후검증 1(기대: 1줄, security_definer = false, proconfig = {search_path=public}, anon_exec = false, auth_exec = true)
-- select p.proname, p.prosecdef as security_definer, p.proconfig,
--        has_function_privilege('anon', p.oid, 'execute') as anon_exec,
--        has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
-- from pg_proc p where p.proname = 'replace_transport_details';
