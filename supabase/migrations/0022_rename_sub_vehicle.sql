-- 로드맵 66: 기사(서브) 차량 번호를 바꿀 때 그 번호에 묶인 서버 값을 한 번에 바꾼다.
-- 차량 번호(vehicles.number·legacy_log_id·raw.number), 같은 차주의 그 번호 전용 거래처(clients.raw.scopedToVehicleNumber),
-- 차량별 설정 키(profiles.settings.subCarSettings)가 셋 다 바뀌거나 하나도 안 바뀐다(함수 하나 = 한 트랜잭션).
-- security invoker: 부르는 사람 권한 그대로(본인 차량·거래처·프로필 RLS). 데이터 삭제·표 변경 없음, create or replace라 다시 실행해도 안전.

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

-- 사후검증 1(기대: 1줄, security_definer = false, 실행 권한 authenticated만)
-- select p.proname, p.prosecdef as security_definer, p.proconfig,
--        has_function_privilege('anon', p.oid, 'execute') as anon_exec,
--        has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
-- from pg_proc p where p.proname = 'rename_sub_vehicle';
