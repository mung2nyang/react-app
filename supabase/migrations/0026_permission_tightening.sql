-- 0026: 출시 전 권한 정리(로드맵 34-B). 34-A 점검에서 뚫린 곳은 없었고, 막는 겹을 하나 더 둔다. 앱 동작·데이터는 그대로.
-- 안 쓰는 옛 함수 실행권, 로그인 안 한 사람의 표 권한, 로그인한 사람의 TRUNCATE·TRIGGER·REFERENCES, 트리거 함수 실행권을 회수하고 search_path를 고정한다.
begin;

-- G1: 0015 이후 앱이 안 부르는 옛 함수(연동 기사가 차주 설정 묶음을 읽던 것). 지우지 않고 실행권만 회수.
revoke all on function public.get_linked_owner_profile_settings(uuid) from public, anon, authenticated;

-- G2: 앱 비회원은 서버 표를 쓰지 않는다. 로그인한 사람도 표 통째 비우기·트리거·외래키 만들기는 쓰지 않는다.
revoke all on all tables in schema public from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;

-- G3: 트리거 함수는 직접 부를 일이 없다(트리거 실행은 실행권을 다시 보지 않음).
revoke all on function public.guard_vehicle_delete_while_linked() from public, anon, authenticated;
revoke all on function public.touch_daily_inspections_updated_at() from public, anon, authenticated;

-- G4: 다른 함수들처럼 public만 보게 고정.
alter function public.upsert_driver_link_idempotent(text, uuid, text, date, date) set search_path = public;

commit;

-- 사후검증 1(기대: anon_grants 0, auth_risky 0, g1_auth false, g3_guard_anon false, g3_touch_anon false, g4_config {search_path=public})
-- select (select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon') as anon_grants,
--   (select count(*) from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')) as auth_risky,
--   has_function_privilege('authenticated', 'public.get_linked_owner_profile_settings(uuid)', 'EXECUTE') as g1_auth,
--   has_function_privilege('anon', 'public.guard_vehicle_delete_while_linked()', 'EXECUTE') as g3_guard_anon,
--   has_function_privilege('anon', 'public.touch_daily_inspections_updated_at()', 'EXECUTE') as g3_touch_anon,
--   (select proconfig from pg_proc where oid = 'public.upsert_driver_link_idempotent(text, uuid, text, date, date)'::regprocedure) as g4_config;
-- 사후검증 2(기대: 표 11개 모두 authenticated에 DELETE,INSERT,SELECT,UPDATE 그대로)
-- select table_name, string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
-- where table_schema = 'public' and grantee = 'authenticated' group by table_name order by table_name;
-- 사후검증 3(기대: 트리거 2개 그대로 켜짐 'O')
-- select tgname, tgenabled from pg_trigger where tgname in ('vehicles_guard_linked_delete', 'daily_inspections_touch');
-- 사후검증 4(기대: 연동 중 차량 지우기가 0020 "연동 중" 오류로 멈춤 — 되돌리는 시험)
-- begin;
-- select set_config('request.jwt.claims', json_build_object('sub', dl.owner_id, 'role', 'authenticated')::text, true) from public.driver_links dl where dl.status = 'linked' limit 1;
-- set local role authenticated;
-- delete from public.vehicles where id = (select vehicle_id from public.driver_links where status = 'linked' limit 1);
-- rollback;
