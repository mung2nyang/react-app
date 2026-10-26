-- 0027: 운행·콜 상세·지출·점검표 줄의 작성자(user_id)를 남의 id로 못 바꾸게(로드맵 34-C).
-- 앱은 작성자를 그대로 두거나(지출 고치기·빈 날 정리) 저장하는 본인으로 바꾸고(운행 기록·점검표 덮어쓰기), 계정 탈퇴는 외래키로 비운다 — 이 셋만 허용.
begin;

create or replace function public.guard_log_writer_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
    and new.user_id is not null
    and new.user_id is distinct from auth.uid() then
    raise exception '작성자 칸은 저장하는 본인으로만 바꿀 수 있습니다.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_log_writer_change() from public, anon, authenticated;

drop trigger if exists daily_logs_guard_writer on public.daily_logs;
create trigger daily_logs_guard_writer before update of user_id on public.daily_logs
  for each row execute function public.guard_log_writer_change();
drop trigger if exists transport_details_guard_writer on public.transport_details;
create trigger transport_details_guard_writer before update of user_id on public.transport_details
  for each row execute function public.guard_log_writer_change();
drop trigger if exists fuel_records_guard_writer on public.fuel_records;
create trigger fuel_records_guard_writer before update of user_id on public.fuel_records
  for each row execute function public.guard_log_writer_change();
drop trigger if exists maintenance_records_guard_writer on public.maintenance_records;
create trigger maintenance_records_guard_writer before update of user_id on public.maintenance_records
  for each row execute function public.guard_log_writer_change();
drop trigger if exists misc_expense_records_guard_writer on public.misc_expense_records;
create trigger misc_expense_records_guard_writer before update of user_id on public.misc_expense_records
  for each row execute function public.guard_log_writer_change();
drop trigger if exists daily_inspections_guard_writer on public.daily_inspections;
create trigger daily_inspections_guard_writer before update of user_id on public.daily_inspections
  for each row execute function public.guard_log_writer_change();

commit;

-- 사후검증 1(기대: 트리거 6개 모두 'O', 함수 config {search_path=public}, anon·authenticated 실행권 false)
-- select tgrelid::regclass, tgname, tgenabled from pg_trigger where tgname like '%_guard_writer' order by 1;
-- select proconfig, has_function_privilege('anon', oid, 'EXECUTE') anon_exec, has_function_privilege('authenticated', oid, 'EXECUTE') auth_exec
-- from pg_proc where proname = 'guard_log_writer_change';
-- 사후검증 2(기대: 오류로 "시험 결과: (가) 본인으로: 됨 / (나) 남으로: 막힘 — 작성자 칸은 저장하는 본인으로만 바꿀 수 있습니다. / (다) 그대로: 됨", 전부 되돌림)
-- begin;
-- select set_config('request.jwt.claims', json_build_object('sub', dl.owner_id, 'role', 'authenticated')::text, true)
--   from public.driver_links dl
--   where dl.status = 'linked' and exists (select 1 from public.daily_logs d where d.vehicle_id = dl.vehicle_id)
--   limit 1;
-- set local role authenticated;
-- do $$
-- declare
--   v_log public.daily_logs.id%type;
--   v_driver uuid;
--   v_out text := '';
-- begin
--   select d.id, dl.driver_id into v_log, v_driver
--     from public.daily_logs d join public.driver_links dl on dl.vehicle_id = d.vehicle_id
--     where dl.owner_id = auth.uid() and dl.status = 'linked' limit 1;
--   begin update public.daily_logs set user_id = auth.uid() where id = v_log; v_out := v_out || '(가) 본인으로: 됨 / ';
--   exception when others then v_out := v_out || '(가) 본인으로: ' || sqlerrm || ' / '; end;
--   begin update public.daily_logs set user_id = v_driver where id = v_log; v_out := v_out || '(나) 남으로: 됨 / ';
--   exception when others then v_out := v_out || '(나) 남으로: 막힘 — ' || sqlerrm || ' / '; end;
--   begin update public.daily_logs set raw = raw where id = v_log; v_out := v_out || '(다) 그대로: 됨';
--   exception when others then v_out := v_out || '(다) 그대로: ' || sqlerrm; end;
--   raise exception '시험 결과: %', v_out;
-- end $$;
-- rollback;
-- 사후검증 3(기대: 시험 전후로 운행 기록 수·연동 수 그대로)
-- select (select count(*) from public.daily_logs) as logs, (select count(*) from public.driver_links where status = 'linked') as linked;
