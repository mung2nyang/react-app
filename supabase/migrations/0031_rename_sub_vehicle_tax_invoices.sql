-- 0031: 기사 차량 번호를 바꿀 때 그 차량 세금계산서(raw)의 번호도 같이 옮긴다 — 번호·거래처·설정·계산서가 한 번에(0022와 같은 함수, 본문만 더함).
begin;

create or replace function public.rename_sub_vehicle(p_vehicle_id uuid, p_new_number text)
returns table (old_number text, new_number text, clients_updated integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old text;
  v_new text := btrim(coalesce(p_new_number, ''));
  v_clients integer := 0;
begin
  if v_new = '' then
    raise exception '차량번호를 입력해 주세요.' using errcode = 'P0001';
  end if;

  select v.number into v_old
  from public.vehicles v
  where v.id = p_vehicle_id and v.user_id = auth.uid() and v.type = 'sub'
  for update;
  if not found then
    raise exception '차량을 찾지 못했습니다.' using errcode = 'P0001';
  end if;

  if v_old = v_new then
    return query select v_old, v_new, 0;
    return;
  end if;

  if exists (select 1 from public.vehicles v where v.user_id = auth.uid() and v.number = v_new and v.id <> p_vehicle_id) then
    raise exception '이미 등록된 차량번호입니다.' using errcode = 'P0001';
  end if;

  update public.vehicles v
  set number = v_new,
      legacy_log_id = v_new,
      raw = jsonb_set(coalesce(v.raw, '{}'::jsonb), '{number}', to_jsonb(v_new))
  where v.id = p_vehicle_id;

  update public.clients c
  set raw = jsonb_set(c.raw, '{scopedToVehicleNumber}', to_jsonb(v_new))
  where c.user_id = auth.uid() and c.raw ->> 'scopedToVehicleNumber' = v_old;
  get diagnostics v_clients = row_count;

  update public.tax_invoices t
  set raw = t.raw || jsonb_strip_nulls(jsonb_build_object(
        'id', case when right(t.raw ->> 'id', length(v_old) + 2) = '__' || v_old
                   then left(t.raw ->> 'id', length(t.raw ->> 'id') - length(v_old)) || v_new end,
        'partyKey', case when right(t.raw ->> 'partyKey', length(v_old) + 2) = '__' || v_old
                         then left(t.raw ->> 'partyKey', length(t.raw ->> 'partyKey') - length(v_old)) || v_new end,
        'carNumber', case when t.raw ->> 'carNumber' = v_old then v_new end,
        'logId', case when t.raw ->> 'logId' = v_old then v_new end,
        'vehicleLabel', case when t.raw ->> 'vehicleLabel' = v_old then v_new
                             when right(t.raw ->> 'vehicleLabel', length(v_old) + 2) = ', ' || v_old
                             then left(t.raw ->> 'vehicleLabel', length(t.raw ->> 'vehicleLabel') - length(v_old)) || v_new end,
        'supplierKey', case when left(t.raw ->> 'supplierKey', length(v_old) + 5) = 'car:' || v_old || ':'
                            then 'car:' || v_new || substr(t.raw ->> 'supplierKey', length(v_old) + 5) end,
        'vehicleNumbers', case when jsonb_typeof(t.raw -> 'vehicleNumbers') = 'array' and (t.raw -> 'vehicleNumbers') ? v_old
                               then (select jsonb_agg(case when e = v_old then v_new else e end)
                                     from jsonb_array_elements_text(t.raw -> 'vehicleNumbers') e) end
      ))
  where t.user_id = auth.uid() and t.vehicle_id = p_vehicle_id;

  update public.profiles p
  set settings = jsonb_set(
        p.settings,
        '{subCarSettings}',
        ((p.settings -> 'subCarSettings') - v_old) || jsonb_build_object(v_new, p.settings -> 'subCarSettings' -> v_old)
      ),
      updated_at = now()
  where p.id = auth.uid()
    and jsonb_typeof(p.settings -> 'subCarSettings') = 'object'
    and (p.settings -> 'subCarSettings') ? v_old;

  return query select v_old, v_new, v_clients;
end;
$$;

revoke all on function public.rename_sub_vehicle(uuid, text) from public, anon;
grant execute on function public.rename_sub_vehicle(uuid, text) to authenticated;

commit;

-- 사후검증(기대: 1줄, security_definer = false, proconfig = {search_path=public}, anon_exec = false, auth_exec = true, touches_invoices = true)
-- select p.proname, p.prosecdef as security_definer, p.proconfig,
--        has_function_privilege('anon', p.oid, 'execute') as anon_exec,
--        has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
--        position('tax_invoices' in p.prosrc) > 0 as touches_invoices
-- from pg_proc p where p.proname = 'rename_sub_vehicle';

-- 되돌리기(앱을 먼저 되돌린 뒤): 0022_rename_sub_vehicle.sql을 다시 실행(계산서 덩이 없는 본문으로).
