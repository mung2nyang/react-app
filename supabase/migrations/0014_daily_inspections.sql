-- 9-A: 일상점검표 저장 표(차량+날짜 1장)와 권한. 화면은 9-B부터.
-- 작성·수정·삭제 = 그 날짜의 운행자만(연동 기사, 또는 그 날짜에 연동 중인 기사가 없는 차량의 주인). 차주는 연동 기사 점검표를 조회만.
-- "미"(휴무·미작성)는 저장하지 않고 화면·출력에서 계산. 점검자 이름은 저장 순간 이름(inspector_name)으로 고정.
-- 연동 해제 복사(copy_driver_link_records_internal, 0013 본문 그대로)에 점검표 복사 1단계 추가.
-- 2026-10-01 Supabase SQL Editor에서 실행·검증함(AI가 사용자 지시로 실행). 멱등. 기존 데이터 변경 없음.

begin;

create table if not exists public.daily_inspections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  work_date date not null,
  items jsonb not null default '{}'::jsonb,
  action_note text,
  inspector_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_inspections_vehicle_date_key unique (vehicle_id, work_date),
  constraint daily_inspections_items_check check (
    jsonb_typeof(items) = 'object'
    and not jsonb_path_exists(items, '$.* ? (@.type() != "string" || (@ != "good" && @ != "bad"))')
  )
);
alter table public.daily_inspections enable row level security;

create or replace function public.touch_daily_inspections_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists daily_inspections_touch on public.daily_inspections;
create trigger daily_inspections_touch before update on public.daily_inspections
  for each row execute function public.touch_daily_inspections_updated_at();

-- 내 차량이고, 그 차량에 지금 연동 중이며 그 날짜가 연동 기간 안인 기사가 있으면 참(남의 차량은 항상 거짓 — 정보 노출 없음).
create or replace function public.vehicle_has_linked_driver_on(p_vehicle_id uuid, p_work_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.driver_links dl
      join public.vehicles v on v.id = dl.vehicle_id
     where dl.vehicle_id = p_vehicle_id and v.user_id = auth.uid() and dl.status = 'linked'
       and (dl.assignment_start is null or p_work_date >= dl.assignment_start)
       and (dl.assignment_end is null or p_work_date <= dl.assignment_end)
  );
$$;
revoke all on function public.vehicle_has_linked_driver_on(uuid, date) from public;
revoke execute on function public.vehicle_has_linked_driver_on(uuid, date) from anon;
grant execute on function public.vehicle_has_linked_driver_on(uuid, date) to authenticated;

drop policy if exists "일상점검 조회" on public.daily_inspections;
create policy "일상점검 조회" on public.daily_inspections for select
  using (vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
         or public.driver_can_access_vehicle_date(vehicle_id, work_date));
drop policy if exists "일상점검 작성" on public.daily_inspections;
create policy "일상점검 작성" on public.daily_inspections for insert
  with check (user_id = auth.uid()
              and (public.driver_can_access_vehicle_date(vehicle_id, work_date)
                   or (vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
                       and not public.vehicle_has_linked_driver_on(vehicle_id, work_date))));
drop policy if exists "일상점검 수정" on public.daily_inspections;
create policy "일상점검 수정" on public.daily_inspections for update
  using (public.driver_can_access_vehicle_date(vehicle_id, work_date)
         or (vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
             and not public.vehicle_has_linked_driver_on(vehicle_id, work_date)))
  with check (public.driver_can_access_vehicle_date(vehicle_id, work_date)
              or (vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
                  and not public.vehicle_has_linked_driver_on(vehicle_id, work_date)));
drop policy if exists "일상점검 삭제" on public.daily_inspections;
create policy "일상점검 삭제" on public.daily_inspections for delete
  using (public.driver_can_access_vehicle_date(vehicle_id, work_date)
         or (vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
             and not public.vehicle_has_linked_driver_on(vehicle_id, work_date)));

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
  fc public.clients;
  d_has_fixed boolean;
  route_keys jsonb;
  o_settings jsonb;
  d_settings jsonb;
  d_presets jsonb;
  p jsonb;
  added integer := 0;
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

  -- 7-D-3 ②: 기사 계정에 원래 고정노선 거래처가 있었는지(있으면 복사본은 일반 거래처로). 복사 기간에 고정 횟수·파렛트가 있으면
  -- 앱과 같은 규칙(그 차량 전용 → 없으면 차주 공용)으로 차주 고정노선 거래처 1곳을 골라 아래 거래처 복사에 함께 넣는다.
  d_has_fixed := exists (select 1 from public.clients where user_id = l.driver_id and raw ->> 'fixedRouteLinked' = 'true');
  if exists (select 1 from public.daily_logs
              where vehicle_id = l.vehicle_id and (coalesce(fixed_count, 0) > 0 or coalesce(pallet_count, 0) > 0)
                and (l.assignment_start is null or work_date >= l.assignment_start)
                and (l.assignment_end is null or work_date <= l.assignment_end)) then
    select c.* into fc from public.clients c
     where c.user_id = l.owner_id and c.raw ->> 'fixedRouteLinked' = 'true' and c.raw ->> 'scopedToVehicleNumber' = v.number
     order by c.display_order, c.id limit 1;
    if fc.id is null then
      select c.* into fc from public.clients c
       where c.user_id = l.owner_id and c.raw ->> 'fixedRouteLinked' = 'true' and coalesce(c.raw ->> 'scopedToVehicleNumber', '') = ''
       order by c.display_order, c.id limit 1;
    end if;
  end if;

  for oc in
    select c.* from public.clients c
     where c.id in (
       select td.client_id from public.transport_details td
        where td.vehicle_id = l.vehicle_id and td.client_id is not null
          and (l.assignment_start is null or td.work_date >= l.assignment_start)
          and (l.assignment_end is null or td.work_date <= l.assignment_end))
        or c.id = fc.id
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
                   when oc.raw ? 'fixedRouteLinked' then
                     jsonb_set(jsonb_set(oc.raw - 'scopedToVehicleNumber', '{id}', to_jsonb(coalesce(dc_legacy, dc_id::text))),
                               '{fixedRouteLinked}', to_jsonb(coalesce(oc.id = fc.id, false) and not d_has_fixed))
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

  -- 9-A: 이번 연동 기간 그 차량 일상점검표를 기사 메인 차량으로 복사(작성자 = 기사, 같은 날짜에 기사 것이 있으면 기사 것 유지).
  insert into public.daily_inspections (user_id, vehicle_id, work_date, items, action_note, inspector_name, created_at, updated_at)
  select l.driver_id, d_vehicle, i.work_date, i.items, i.action_note, i.inspector_name, i.created_at, i.updated_at
    from public.daily_inspections i
   where i.vehicle_id = l.vehicle_id
     and (l.assignment_start is null or i.work_date >= l.assignment_start)
     and (l.assignment_end is null or i.work_date <= l.assignment_end)
  on conflict (vehicle_id, work_date) do nothing;

  -- 7-D-3 ①: 복사한 날들의 노선 칩 횟수에 나온 이름표를 차주 설정에서 찾아 기사 설정에 추가(앱 한도 10개), 추가했으면 칩 표시를 켠다.
  select coalesce(jsonb_agg(distinct k.key), '[]'::jsonb) into route_keys
    from public.daily_logs d
    cross join lateral jsonb_object_keys(case when jsonb_typeof(d.raw -> 'fixedRouteCounts') = 'object' then d.raw -> 'fixedRouteCounts' else '{}'::jsonb end) as k(key)
   where d.vehicle_id = l.vehicle_id
     and (l.assignment_start is null or d.work_date >= l.assignment_start)
     and (l.assignment_end is null or d.work_date <= l.assignment_end);
  if jsonb_array_length(route_keys) > 0 then
    select coalesce(settings, '{}'::jsonb) into o_settings from public.profiles where id = l.owner_id;
    select coalesce(settings, '{}'::jsonb) into d_settings from public.profiles where id = l.driver_id;
    d_presets := case when jsonb_typeof(d_settings -> 'fixedRoutePresets') = 'array' then d_settings -> 'fixedRoutePresets' else '[]'::jsonb end;
    for p in
      select e from jsonb_array_elements(case when jsonb_typeof(o_settings -> 'fixedRoutePresets') = 'array' then o_settings -> 'fixedRoutePresets' else '[]'::jsonb end) as e
    loop
      if route_keys ? (p ->> 'id') and jsonb_array_length(d_presets) < 10
         and not exists (select 1 from jsonb_array_elements(d_presets) as x where x ->> 'id' = p ->> 'id') then
        d_presets := d_presets || jsonb_build_array(p);
        added := added + 1;
      end if;
    end loop;
    if added > 0 then
      d_settings := jsonb_set(d_settings, '{fixedRoutePresets}', d_presets);
      if coalesce(d_settings ->> 'fixedRouteOn', '') <> 'true' then
        d_settings := jsonb_set(d_settings, '{fixedRouteOn}', 'true'::jsonb);
      end if;
      update public.profiles set settings = d_settings where id = l.driver_id;
    end if;
  end if;
end;
$$;
revoke all on function public.copy_driver_link_records_internal(uuid) from public;
revoke execute on function public.copy_driver_link_records_internal(uuid) from anon, authenticated;

commit;

-- 사후검증(읽기 전용)
-- select relrowsecurity from pg_class where oid = 'public.daily_inspections'::regclass;  -- true
-- select policyname, cmd from pg_policies where tablename = 'daily_inspections' order by cmd;  -- 4행(삭제·작성·조회·수정)
-- select conname from pg_constraint where conrelid = 'public.daily_inspections'::regclass;  -- 기본키·외래키 2·유일·items 검사
-- select prosecdef, proconfig from pg_proc where proname = 'vehicle_has_linked_driver_on';  -- true, {search_path=public}
-- select position('9-A' in prosrc) > 0 from pg_proc where proname = 'copy_driver_link_records_internal';  -- true
-- select has_function_privilege('authenticated','public.copy_driver_link_records_internal(uuid)','execute');  -- false

-- 되돌리기: drop table public.daily_inspections; drop function public.vehicle_has_linked_driver_on(uuid, date);
-- drop function public.touch_daily_inspections_updated_at(); copy_driver_link_records_internal은 0013 본문으로 다시 만든다.
