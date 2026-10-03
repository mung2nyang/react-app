-- 10-S-2 검증: 0019 적용 후 postgres SQL Editor에서 파일 전체를 한 번에 실행.
-- 실제 사용자/차량 수정 없이 랜덤 임시 fixture만 사용. 성공/실패 모두 최종 ROLLBACK.
-- 기대: 맨 아래 'PASS' 한 줄. 중간에 'FAIL:'로 시작하는 오류가 나면 그 줄이 실패 지점.
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

do $$
declare
  owner_a uuid := gen_random_uuid();
  driver_c uuid := gen_random_uuid();
  car_a uuid := gen_random_uuid();
  link_a uuid := gen_random_uuid();
  code_a text := 'A2B3C4D5E6';
  code_b text := 'Z9Y8X7W6V5';
  day_a date := (now() at time zone 'Asia/Seoul')::date;
  expires timestamptz;
  n bigint;
  i int;
  row_link public.driver_links;
  failed boolean;
begin
  if current_user <> 'postgres' then raise exception '시험 준비는 postgres로 실행해야 합니다.'; end if;
  execute format('grant usage on schema %I to authenticated, anon',
    (select nspname from pg_namespace where oid=pg_my_temp_schema()));
  if exists (select 1 from public.driver_links where invite_code in (code_a, code_b)) then
    raise exception '시험용 코드가 이미 있습니다. 코드 값을 바꿔 다시 실행하세요.';
  end if;
  insert into auth.users(id) values (owner_a), (driver_c);
  insert into public.profiles(id, name) values (owner_a, '10-S-2 임시 차주'), (driver_c, '10-S-2 임시 기사');
  insert into public.vehicles(id, user_id, number, type) values (car_a, owner_a, '10-S-2 시험', 'sub');

  -- 1) 차주: 약한 코드·소문자·하이픈 포함 코드는 저장 거절.
  perform set_config('request.jwt.claim.sub', owner_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_a,'role','authenticated')::text, true);
  set local role authenticated;
  perform pg_temp.expect_denied(format('insert into public.driver_links(owner_id,vehicle_id,invite_code,status,assignment_start) values(%L,%L,%L,''pending'',%L)', owner_a, car_a, '123456', day_a));
  perform pg_temp.expect_denied(format('insert into public.driver_links(owner_id,vehicle_id,invite_code,status,assignment_start) values(%L,%L,%L,''pending'',%L)', owner_a, car_a, lower(code_a), day_a));
  perform pg_temp.expect_denied(format('insert into public.driver_links(owner_id,vehicle_id,invite_code,status,assignment_start) values(%L,%L,%L,''pending'',%L)', owner_a, car_a, 'A2B3C-4D5E6', day_a));
  perform pg_temp.expect_denied(format('insert into public.driver_links(owner_id,vehicle_id,invite_code,status,assignment_start) values(%L,%L,NULL,''pending'',%L)', owner_a, car_a, day_a));

  -- 2) 정상 코드 저장: 화면이 보낸 기한(100일)은 무시하고 서버가 7일로 정한다.
  insert into public.driver_links(id,owner_id,vehicle_id,invite_code,status,assignment_start,invite_expires_at)
    values(link_a,owner_a,car_a,code_a,'pending',day_a,now() + interval '100 days');
  select invite_expires_at into expires from public.driver_links where id = link_a;
  if expires is distinct from now() + interval '7 days' then raise exception 'FAIL: 새 초대 기한이 7일이 아님: %', expires; end if;

  -- 3) 기한만 늘리기 → 무시. 형식 틀린 코드로 바꾸기 → 거절. 계약 기간 수정은 그대로 됨.
  update public.driver_links set invite_expires_at = now() + interval '100 days' where id = link_a;
  select invite_expires_at into expires from public.driver_links where id = link_a;
  if expires is distinct from now() + interval '7 days' then raise exception 'FAIL: 차주가 기한을 늘림: %', expires; end if;
  perform pg_temp.expect_denied(format('update public.driver_links set invite_code = %L where id = %L', '654321', link_a));
  update public.driver_links set assignment_end = day_a + 30 where id = link_a;
  select count(*) into n from public.driver_links where id = link_a and assignment_end = day_a + 30;
  if n <> 1 then raise exception 'FAIL: 정상 계약 기간 수정 실패'; end if;

  -- 4) 기사: 틀린 코드는 빈 결과 + 실패 기록, 5번째 뒤 6번째는 막힘.
  reset role;
  perform set_config('request.jwt.claim.sub', driver_c::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',driver_c,'role','authenticated')::text, true);
  set local role authenticated;
  for i in 1..5 loop
    select count(*) into n from public.redeem_driver_invite_code('WRONG' || i || 'CODE');
    if n <> 0 then raise exception 'FAIL: 틀린 코드가 연결됨'; end if;
  end loop;
  failed := false;
  begin
    perform public.redeem_driver_invite_code(code_a);
  exception when others then
    if sqlerrm like '%여러 번 틀렸습니다%' then failed := true; else raise; end if;
  end;
  if not failed then raise exception 'FAIL: 6번째 시도가 막히지 않음'; end if;
  perform pg_temp.expect_denied('select * from public.driver_invite_redeem_attempts');
  reset role;
  select count(*) into n from public.driver_invite_redeem_attempts where user_id = driver_c;
  if n <> 5 then raise exception 'FAIL: 실패 기록 % 건(기대 5)', n; end if;
  delete from public.driver_invite_redeem_attempts where user_id = driver_c;

  -- 5) 만료된 코드는 맞아도 연결 안 됨(내부 경로로 기한을 과거로 돌림).
  perform set_config('app.driver_link_internal','on',true);
  update public.driver_links set invite_expires_at = now() - interval '1 minute' where id = link_a;
  perform set_config('app.driver_link_internal','off',true);
  perform set_config('request.jwt.claim.sub', driver_c::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',driver_c,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.redeem_driver_invite_code(code_a);
  if n <> 0 then raise exception 'FAIL: 만료 코드로 연결됨'; end if;

  -- 6) 차주 재발급(새 코드) → 기한 다시 7일. 기사는 소문자·하이픈 섞어 입력해도 연결.
  reset role;
  perform set_config('request.jwt.claim.sub', owner_a::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_a,'role','authenticated')::text, true);
  set local role authenticated;
  update public.driver_links set invite_code = code_b where id = link_a;
  select invite_expires_at into expires from public.driver_links where id = link_a;
  if expires is distinct from now() + interval '7 days' then raise exception 'FAIL: 재발급 기한이 7일이 아님: %', expires; end if;
  reset role;
  perform set_config('request.jwt.claim.sub', driver_c::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',driver_c,'role','authenticated')::text, true);
  set local role authenticated;
  select * into row_link from public.redeem_driver_invite_code(lower(substr(code_b,1,5)) || ' - ' || substr(code_b,6));
  if row_link.status is distinct from 'linked' or row_link.driver_id is distinct from driver_c then
    raise exception 'FAIL: 정상 재발급 코드로 연결 안 됨';
  end if;
  reset role;
  if current_setting('app.driver_link_internal',true) <> 'off' then raise exception 'FAIL: 내부 허용 표시가 남았습니다'; end if;

  -- 7) 비로그인은 수락 함수 실행 불가.
  set local role anon;
  perform pg_temp.expect_denied(format('select public.redeem_driver_invite_code(%L)', code_b));
  reset role;
  raise notice '10-S-2 invite code checks PASS; all fixtures will ROLLBACK';
end;
$$;
select 'PASS: 형식·기한·재발급·실패 제한·만료·정상 연결·anon, 아래 ROLLBACK으로 전부 복구' as result;
rollback;
