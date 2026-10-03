-- 10-S-1 검증: 0017/0018 적용 후 postgres SQL Editor에서 파일 전체를 한 번에 실행.
-- 실행 전 보리 승인 필요. 실제 사용자/차량 수정 없이 랜덤 임시 fixture만 사용.
-- CREATE/INSERT도 포함되므로 읽기 전용 아님. 성공/실패 모두 최종 ROLLBACK.
-- PostgreSQL 두 세션의 동시 수락 시험은 아래 별도 절차로 확인(이 파일은 순차 시험).
-- 2026-10-03: 적용 전 DDL 포함 되돌림 PASS, 기존 규칙에서는 공격 INSERT 검출 FAIL,
-- 정식 적용 후 PASS. 최종 연동 5·사용자 11·차량 12 유지, 임시 프로필 0 확인.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

-- invoker helper: 42501만 예상 거절로 인정. 문법/제약 오류를 통과로 오인하지 않는다.
create function pg_temp.expect_denied(sql_text text) returns void
language plpgsql security invoker as $$
begin
  begin
    execute sql_text;
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'FAIL: 허용되면 안 되는 SQL: %', sql_text;
end;
$$;
create function pg_temp.expect_no_effect(sql_text text) returns void
language plpgsql security invoker as $$
declare n integer;
begin
  begin
    execute sql_text;
    get diagnostics n = row_count;
  exception when insufficient_privilege then
    return;
  end;
  if n <> 0 then raise exception 'FAIL: 차단 대상 변경 %행: %', n, sql_text; end if;
end;
$$;

do $$
declare
  owner_a uuid := gen_random_uuid();
  owner_b uuid := gen_random_uuid();
  driver_c uuid := gen_random_uuid();
  car_a uuid := gen_random_uuid();
  car_a2 uuid := gen_random_uuid();
  car_b uuid := gen_random_uuid();
  link_a uuid := gen_random_uuid();
  link_again uuid := gen_random_uuid();
  log_a uuid := gen_random_uuid();
  copied_car uuid;
  code_a text := gen_random_uuid()::text;
  code_again text := gen_random_uuid()::text;
  day_a date := (now() at time zone 'Asia/Seoul')::date - 10;
  target text;
  n bigint;
  row_link public.driver_links;
  v_state text;
begin
  if current_user <> 'postgres' then raise exception '시험 준비는 postgres로 실행해야 합니다.'; end if;
  execute format('grant usage on schema %I to authenticated, anon',
    (select nspname from pg_namespace where oid=pg_my_temp_schema()));
  -- 실 서버 SELECT로 auth.users 가입 트리거 없음·필수 컬럼 확인함.
  insert into auth.users(id) values (owner_a), (owner_b), (driver_c);
  insert into public.profiles(id, name) values
    (owner_a, '10-S 임시 차주'), (owner_b, '10-S 임시 타인'), (driver_c, '10-S 임시 기사');
  insert into public.vehicles(id, user_id, number, type) values
    (car_a, owner_a, '10-S 시험 A', 'sub'), (car_a2, owner_a, '10-S 시험 A2', 'sub'),
    (car_b, owner_b, '10-S 시험 B', 'sub');
  insert into public.daily_logs(id, user_id, vehicle_id, work_date, raw)
    values(log_a, owner_a, car_a, day_a, '{}');
  foreach target in array array['transport_details','fuel_records','maintenance_records','misc_expense_records'] loop
    execute format('insert into public.%I(daily_log_id,user_id,vehicle_id,work_date) values(%L,%L,%L,%L)',
      target, log_a, owner_a, car_a, day_a);
  end loop;
  insert into public.daily_inspections(user_id,vehicle_id,work_date,items,inspector_name)
    values(owner_a,car_a,day_a,'{"brakes":"good"}','10-S 시험');

  perform set_config('request.jwt.claim.sub', owner_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_a,'role','authenticated')::text, true);
  set local role authenticated;
  if current_user <> 'authenticated' or auth.uid() <> owner_a then raise exception '사용자 문맥 실패'; end if;
  -- 정상 INSERT 성공이 있어야 테스트 준비/권한 자체가 틀린 것을 놓치지 않는다.
  insert into public.driver_links(id,owner_id,vehicle_id,invite_code,status,assignment_start)
    values(link_a,owner_a,car_a,code_a,'pending',day_a);
  update public.driver_links set assignment_end = day_a + 30 where id = link_a;
  select count(*) into n from public.driver_links where id = link_a and assignment_end = day_a + 30;
  if n <> 1 then raise exception '정상 초대 수정 실패'; end if;

  perform pg_temp.expect_denied(format('insert into public.driver_links(owner_id,vehicle_id) values(%L,%L)', owner_a,car_b));
  foreach v_state in array array['linked','disconnected'] loop
    perform pg_temp.expect_denied(format('insert into public.driver_links(owner_id,vehicle_id,status) values(%L,%L,%L)',owner_a,car_a,v_state));
  end loop;
  perform pg_temp.expect_denied(format('insert into public.driver_links(owner_id,vehicle_id,status) values(%L,%L,NULL)',owner_a,car_a));
  perform pg_temp.expect_denied(format('insert into public.driver_links(owner_id,vehicle_id,driver_id) values(%L,%L,%L)',owner_a,car_a,owner_a));
  perform pg_temp.expect_denied(format('insert into public.driver_links(owner_id,vehicle_id,driver_id) values(%L,%L,%L)',owner_a,car_a,driver_c));
  perform pg_temp.expect_denied(format('insert into public.driver_links(owner_id,vehicle_id,unlink_requested_by) values(%L,%L,%L)',owner_a,car_a,owner_a));
  perform pg_temp.expect_denied(format('insert into public.driver_links(owner_id,vehicle_id,unlink_requested_at) values(%L,%L,now())',owner_a,car_a));
  perform pg_temp.expect_denied(format('update public.driver_links set status=''linked'' where id=%L',link_a));
  perform pg_temp.expect_denied(format('update public.driver_links set driver_id=%L where id=%L',driver_c,link_a));
  perform pg_temp.expect_denied(format('update public.driver_links set vehicle_id=%L where id=%L',car_b,link_a));
  perform pg_temp.expect_denied(format('update public.driver_links set owner_id=%L where id=%L',owner_b,link_a));
  -- 공격자가 내부 표시까지 설정해도 invoker 역할 검사로 막는다.
  perform set_config('app.driver_link_internal','on',true);
  perform pg_temp.expect_denied(format('update public.driver_links set status=''linked'',driver_id=%L where id=%L',driver_c,link_a));
  perform set_config('app.driver_link_internal','off',true);
  select count(*) into n from public.driver_links where owner_id = owner_a;
  if n <> 1 then raise exception '공격 행이 남아 있습니다'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub', driver_c::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',driver_c,'role','authenticated')::text, true);
  set local role authenticated;
  select * into row_link from public.redeem_driver_invite_code(code_a);
  if row_link.driver_id is distinct from driver_c or row_link.status is distinct from 'linked' then raise exception '정상 수락 실패'; end if;
  if current_setting('app.driver_link_internal',true) <> 'off' then raise exception '내부 허용 표시가 남았습니다'; end if;
  begin
    perform public.redeem_driver_invite_code(code_a);
    raise exception '중복 수락 허용' using errcode = 'XX000';
  exception when sqlstate 'P0001' then null;
  end;
  if not public.driver_can_access_vehicle_date(car_a,day_a)
     or public.driver_can_access_vehicle_date(car_a,day_a - 1) then raise exception '계약기간 판단 실패'; end if;
  select count(*) into n from public.profiles where id=owner_a;
  if n <> 1 then raise exception '연동 중 상대 프로필 조회 실패'; end if;
  foreach target in array array['daily_logs','transport_details','fuel_records','maintenance_records','misc_expense_records','daily_inspections'] loop
    execute format('select count(*) from public.%I where vehicle_id=%L',target,car_a) into n;
    if n <> 1 then raise exception '연동 중 기록 조회 실패: %',target; end if;
  end loop;
  perform public.request_driver_unlink(link_a);
  perform public.cancel_driver_unlink(link_a);
  select count(*) into n from public.driver_links where id=link_a and unlink_requested_by is null;
  if n <> 1 then raise exception '해제 요청 취소 실패'; end if;
  perform public.request_driver_unlink(link_a);

  reset role;
  perform set_config('request.jwt.claim.sub', owner_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_a,'role','authenticated')::text, true);
  set local role authenticated;
  update public.driver_links set assignment_end = null where id=link_a;
  perform pg_temp.expect_denied(format('update public.driver_links set vehicle_id=%L where id=%L',car_a2,link_a));
  perform pg_temp.expect_denied(format('update public.driver_links set driver_id=%L where id=%L',owner_b,link_a));
  select * into row_link from public.consent_driver_unlink(link_a);
  if row_link.status is distinct from 'disconnected' then raise exception '동의 해제 실패'; end if;
  perform pg_temp.expect_denied(format('update public.driver_links set status=''linked'' where id=%L',link_a));
  select count(*) into n from public.profiles where id=driver_c;
  if n <> 0 then raise exception '해제 후 기사 프로필 노출'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub', driver_c::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',driver_c,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profiles where id=owner_a;
  if n <> 0 then raise exception '해제 후 차주 프로필 노출'; end if;
  select count(*) into n from public.vehicles where id=car_a;
  if n <> 0 then raise exception '해제 후 차주 차량 노출'; end if;
  foreach target in array array['daily_logs','transport_details','fuel_records','maintenance_records','misc_expense_records','daily_inspections'] loop
    execute format('select count(*) from public.%I where vehicle_id=%L',target,car_a) into n;
    if n <> 0 then raise exception '해제 후 기록 노출: %',target; end if;
    perform pg_temp.expect_no_effect(format('update public.%I set work_date=work_date where vehicle_id=%L',target,car_a));
    perform pg_temp.expect_no_effect(format('delete from public.%I where vehicle_id=%L',target,car_a));
  end loop;
  perform pg_temp.expect_denied(format('insert into public.daily_logs(user_id,vehicle_id,work_date) values(%L,%L,%L)',driver_c,car_a,day_a-2));
  foreach target in array array['transport_details','fuel_records','maintenance_records','misc_expense_records'] loop
    perform pg_temp.expect_denied(format(
      'insert into public.%I(daily_log_id,user_id,vehicle_id,work_date) values(%L,%L,%L,%L)',
      target,log_a,driver_c,car_a,day_a));
  end loop;
  perform pg_temp.expect_denied(format(
    'insert into public.daily_inspections(user_id,vehicle_id,work_date,items) values(%L,%L,%L,''{}'')',
    driver_c,car_a,day_a-2));
  select id into copied_car from public.vehicles where user_id=driver_c and type='main';
  if copied_car is null then raise exception '기사 메인 차량 복사 실패'; end if;
  foreach target in array array['daily_logs','transport_details','fuel_records','maintenance_records','misc_expense_records','daily_inspections'] loop
    execute format('select count(*) from public.%I where vehicle_id=%L',target,copied_car) into n;
    if n <> 1 then raise exception '기사 기록 복사 실패: %',target; end if;
  end loop;

  reset role;
  perform set_config('request.jwt.claim.sub', owner_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_a,'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.driver_links(id,owner_id,vehicle_id,invite_code,assignment_start)
    values(link_again,owner_a,car_a,code_again,day_a+10);
  reset role;
  perform set_config('request.jwt.claim.sub', driver_c::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',driver_c,'role','authenticated')::text, true);
  set local role authenticated;
  perform public.redeem_driver_invite_code(code_again);
  if not public.driver_can_access_vehicle_date(car_a,day_a) then raise exception '같은 기사 재연동 과거 기간 누락'; end if;
  perform public.request_driver_unlink(link_again);
  reset role;
  -- 테스트 행 하나만 4일 전 요청으로 설정. 관리자 준비를 공격 성공으로 세지 않는다.
  perform set_config('app.driver_link_internal','on',true);
  update public.driver_links set unlink_requested_at=now()-interval '4 days' where id=link_again;
  perform set_config('app.driver_link_internal','off',true);
  set local role authenticated;
  select public.settle_expired_driver_unlinks() into n;
  if n <> 1 then raise exception '3일 해제 처리 실패'; end if;
  select public.settle_expired_driver_unlinks() into n;
  if n <> 0 then raise exception '3일 해제 중복 처리'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  set local role anon;
  perform pg_temp.expect_denied(format('insert into public.driver_links(owner_id,vehicle_id) values(%L,%L)',owner_a,car_a));
  perform pg_temp.expect_denied('select public.delete_own_account()');
  perform pg_temp.expect_denied(format('select public.driver_can_access_vehicle_date(%L,%L)',car_a,day_a));
  reset role;
  raise notice '10-S-1 sequential security checks PASS; all fixtures will ROLLBACK';
end;
$$;
select 'PASS: 공격 거절·정상 초대·해제·복사·재연동·anon, 아래 ROLLBACK으로 전부 복구' as result;
rollback;

-- 동시 수락 별도 검증(아직 미실행): 격리된 시험 DB에서 두 로그인 연결을 사용한다.
-- 1) 같은 기사·다른 초대, 2) 다른 기사·같은 초대, 3) 다른 기사·같은 차량의 다른 초대.
-- 첫 연결의 수락 트랜잭션을 열어 둔 채 두 번째 수락이 대기하는지 관찰한다.
-- 첫 연결 COMMIT 후 두 번째는 이미 연동 오류; 최종 linked가 한 건인지 확인한다.
-- 준비 데이터가 두 연결에 보여야 하므로 위 단일 트랜잭션 시험으로 동시성을 주장하지 않는다.
