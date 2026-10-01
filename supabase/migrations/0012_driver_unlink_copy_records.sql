-- 7-D-1: 연동이 해제되는 순간(기사 동의·차주 동의·3일 자동 해제 모두) 이번 연동 기간의 그 차량 기록 전부를 기사 계정으로 복사한다.
-- 기사 계정에 메인 차량이 있으면 그 차량, 없으면 배정 차량과 같은 번호로 메인 차량을 새로 만든다.
-- 복사 대상: 하루 일지·콜 상세·주유·정비·기타 비용(작성자 = 기사). 콜에 쓰인 거래처 중 기사 계정에 같은 이름이 없는 것만 거래처로 복사(연결 대상 지정 제거).
-- 같은 날짜에 기사 일지가 이미 있으면 기사 하루 정보는 그대로 두고 콜·비용만 순서 번호를 뒤로 붙여 넣는다. 새 날짜는 raw.assignedVehicleNumber(배정 차량 번호)를 넣는다.
-- 복사가 실패하면 해제도 같은 묶음에서 취소된다. 차주 쪽 기록은 읽기만 하고 바꾸지 않는다. 기간 null = 제한 없음(7-B 판단 함수와 같은 규칙).
-- 2026-10-01 Supabase SQL Editor에서 실행·검증함(AI가 사용자 지시로 실행). 멱등(create or replace). 기존 데이터 변경 없음.

begin;

create or replace function public.copy_driver_link_records_internal(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.driver_links;
  v public.vehicles;
  d_vehicle uuid;
  d_log uuid;
  d_new boolean;
  r record;
  oc public.clients;
  dc_id uuid;
  dc_legacy text;
  cmap jsonb := '{}'::jsonb;
  off_t integer;
  off_f integer;
  off_m integer;
  off_x integer;
begin
  select * into l from public.driver_links where id = p_link_id;
  if not found or l.driver_id is null then return; end if;
  if not exists (select 1 from public.profiles where id = l.driver_id) then return; end if;
  select * into v from public.vehicles where id = l.vehicle_id;
  if not found then return; end if;

  select id into d_vehicle from public.vehicles
   where user_id = l.driver_id and type = 'main' order by display_order, id limit 1;
  if d_vehicle is null then
    d_vehicle := gen_random_uuid();
    insert into public.vehicles (id, user_id, legacy_log_id, number, type, tonnage, display_order, raw)
    values (d_vehicle, l.driver_id, 'main', v.number, 'main', v.tonnage, 0,
            jsonb_build_object('type', 'main', 'number', v.number, 'tonnage', coalesce(v.tonnage, ''), 'supabaseId', d_vehicle));
  end if;

  for oc in
    select c.* from public.clients c
     where c.id in (
       select td.client_id from public.transport_details td
        where td.vehicle_id = l.vehicle_id and td.client_id is not null
          and (l.assignment_start is null or td.work_date >= l.assignment_start)
          and (l.assignment_end is null or td.work_date <= l.assignment_end))
  loop
    select id, legacy_client_id into dc_id, dc_legacy from public.clients
     where user_id = l.driver_id and company_name is not distinct from oc.company_name order by id limit 1;
    if dc_id is null then
      dc_id := gen_random_uuid();
      dc_legacy := oc.legacy_client_id;
      if dc_legacy is not null and exists (select 1 from public.clients where user_id = l.driver_id and legacy_client_id = dc_legacy) then
        dc_legacy := dc_legacy || '-' || substr(dc_id::text, 1, 8);
      end if;
      insert into public.clients (id, user_id, legacy_client_id, company_name, manager_name, biz_number, phone,
                                  tax_invoice_enabled, is_pinned, comm_enabled, comm_type, comm_value,
                                  payment_term, payment_term_value, display_order, raw)
      values (dc_id, l.driver_id, dc_legacy, oc.company_name, oc.manager_name, oc.biz_number, oc.phone,
              oc.tax_invoice_enabled, oc.is_pinned, oc.comm_enabled, oc.comm_type, oc.comm_value,
              oc.payment_term, oc.payment_term_value,
              (select coalesce(max(display_order) + 1, 0) from public.clients where user_id = l.driver_id),
              case when oc.raw is null then null
                   else jsonb_set(oc.raw - 'scopedToVehicleNumber', '{id}', to_jsonb(coalesce(dc_legacy, dc_id::text))) end);
    end if;
    cmap := cmap || jsonb_build_object(oc.id::text, jsonb_build_object('id', dc_id, 'legacy', dc_legacy, 'olegacy', oc.legacy_client_id));
    dc_id := null; dc_legacy := null;
  end loop;

  for r in
    select * from public.daily_logs
     where vehicle_id = l.vehicle_id
       and (l.assignment_start is null or work_date >= l.assignment_start)
       and (l.assignment_end is null or work_date <= l.assignment_end)
     order by work_date
  loop
    d_log := null;
    insert into public.daily_logs (user_id, vehicle_id, work_date, is_off, fixed_count, pallet_count, raw)
    values (l.driver_id, d_vehicle, r.work_date, r.is_off, r.fixed_count, r.pallet_count,
            coalesce(r.raw, '{}'::jsonb) || jsonb_build_object('assignedVehicleNumber', v.number))
    on conflict (vehicle_id, work_date) do nothing
    returning id into d_log;
    d_new := d_log is not null;
    if not d_new then
      select id into d_log from public.daily_logs where vehicle_id = d_vehicle and work_date = r.work_date;
    end if;

    if d_new then
      off_t := 0; off_f := 0; off_m := 0; off_x := 0;
    else
      select coalesce(max(sequence) + 1, 0) into off_t from public.transport_details where daily_log_id = d_log;
      select coalesce(max(sequence) + 1, 0) into off_f from public.fuel_records where daily_log_id = d_log;
      select coalesce(max(sequence) + 1, 0) into off_m from public.maintenance_records where daily_log_id = d_log;
      select coalesce(max(sequence) + 1, 0) into off_x from public.misc_expense_records where daily_log_id = d_log;
    end if;

    insert into public.transport_details (daily_log_id, user_id, vehicle_id, client_id, work_date, sequence, load_loc, unload_loc,
      fare_amount, distance_km, insurance_fee_amount, remarks, departure_time, arrival_time, receipt, start_odometer, end_odometer,
      vat_exempt, platform, cargo_tonnage, payment_status, payment_due_date, payments, commission_snapshot, raw)
    select d_log, l.driver_id, d_vehicle, (cmap -> t.client_id::text ->> 'id')::uuid, t.work_date, coalesce(t.sequence, 0) + off_t,
      t.load_loc, t.unload_loc, t.fare_amount, t.distance_km, t.insurance_fee_amount, t.remarks, t.departure_time, t.arrival_time,
      t.receipt, t.start_odometer, t.end_odometer, t.vat_exempt, t.platform, t.cargo_tonnage, t.payment_status, t.payment_due_date,
      t.payments, t.commission_snapshot,
      case when t.client_id is not null and t.raw is not null and (t.raw ->> 'clientId') is not distinct from (cmap -> t.client_id::text ->> 'olegacy')
                and (cmap -> t.client_id::text ->> 'legacy') is not null
           then jsonb_set(t.raw, '{clientId}', to_jsonb(cmap -> t.client_id::text ->> 'legacy'))
           else t.raw end
      from public.transport_details t where t.daily_log_id = r.id;

    insert into public.fuel_records (daily_log_id, user_id, vehicle_id, work_date, sequence, cost_amount, subsidy_amount, volume_liter, mileage_km, raw)
    select d_log, l.driver_id, d_vehicle, f.work_date, coalesce(f.sequence, 0) + off_f, f.cost_amount, f.subsidy_amount, f.volume_liter, f.mileage_km, f.raw
      from public.fuel_records f where f.daily_log_id = r.id;

    insert into public.maintenance_records (daily_log_id, user_id, vehicle_id, work_date, sequence, cost_amount, mileage_km, raw)
    select d_log, l.driver_id, d_vehicle, m.work_date, coalesce(m.sequence, 0) + off_m, m.cost_amount, m.mileage_km, m.raw
      from public.maintenance_records m where m.daily_log_id = r.id;

    insert into public.misc_expense_records (daily_log_id, user_id, vehicle_id, work_date, sequence, cost_amount, raw)
    select d_log, l.driver_id, d_vehicle, x.work_date, coalesce(x.sequence, 0) + off_x, x.cost_amount, x.raw
      from public.misc_expense_records x where x.daily_log_id = r.id;
  end loop;
end;
$$;
revoke all on function public.copy_driver_link_records_internal(uuid) from public;
revoke execute on function public.copy_driver_link_records_internal(uuid) from anon, authenticated;

create or replace function public.disconnect_driver_link_internal(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  perform set_config('app.driver_link_internal', 'on', true);
  update public.driver_links
     set status = 'disconnected', assignment_end = (now() at time zone 'Asia/Seoul')::date,
         unlink_requested_by = null, unlink_requested_at = null, updated_at = now()
   where id = p_link_id and status = 'linked';
  get diagnostics n = row_count;
  perform set_config('app.driver_link_internal', 'off', true);
  if n > 0 then
    perform public.copy_driver_link_records_internal(p_link_id);
  end if;
end;
$$;
revoke all on function public.disconnect_driver_link_internal(uuid) from public;
revoke execute on function public.disconnect_driver_link_internal(uuid) from anon, authenticated;

commit;

-- 사후검증(읽기 전용)
-- select proname, prosecdef, proconfig from pg_proc where proname in ('copy_driver_link_records_internal','disconnect_driver_link_internal');  -- 2행, 둘 다 security definer · search_path=public
-- select has_function_privilege('authenticated','public.copy_driver_link_records_internal(uuid)','execute'), has_function_privilege('authenticated','public.disconnect_driver_link_internal(uuid)','execute');  -- false, false
-- select position('copy_driver_link_records_internal' in prosrc) > 0 from pg_proc where proname='disconnect_driver_link_internal';  -- true

-- 되돌리기: disconnect_driver_link_internal을 0011 본문(복사 호출 없는 버전)으로 다시 만들고 drop function public.copy_driver_link_records_internal(uuid);
-- (이미 복사된 기사 쪽 기록은 남는다.)
