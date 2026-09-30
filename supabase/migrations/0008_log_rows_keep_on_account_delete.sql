-- 5-C: 계정이 삭제돼도 운행·비용 기록은 남기고 "쓴 사람"(user_id)만 비운다.
-- 연동 기사가 차주 차량에 입력한 하루 기록·콜 상세·정비·유류·기타가 기사 탈퇴 시 CASCADE로 차주 장부에서 함께 지워지던 것을 막는다
-- (하루 기록 줄이 지워지면 그날 차주 비용·콜 상세까지 연쇄 삭제되던 것 포함). 자기 차량 기록은 vehicles 삭제 연쇄로 지금처럼 지워진다.
-- 2026-09-30 Supabase SQL Editor에서 실행·검증함(AI가 사용자 지시로 실행, 사후검증: 5개 표 모두 ON DELETE SET NULL · user_id nullable YES).
-- 이 파일은 그 기록이다. 멱등이라 다시 실행해도 안전하다(데이터 삭제 없음, 권한 규칙 무변경).

begin;

alter table public.daily_logs alter column user_id drop not null;
alter table public.daily_logs drop constraint if exists daily_logs_user_id_fkey;
alter table public.daily_logs add constraint daily_logs_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

alter table public.transport_details alter column user_id drop not null;
alter table public.transport_details drop constraint if exists transport_details_user_id_fkey;
alter table public.transport_details add constraint transport_details_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

alter table public.fuel_records alter column user_id drop not null;
alter table public.fuel_records drop constraint if exists fuel_records_user_id_fkey;
alter table public.fuel_records add constraint fuel_records_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

alter table public.maintenance_records alter column user_id drop not null;
alter table public.maintenance_records drop constraint if exists maintenance_records_user_id_fkey;
alter table public.maintenance_records add constraint maintenance_records_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

alter table public.misc_expense_records alter column user_id drop not null;
alter table public.misc_expense_records drop constraint if exists misc_expense_records_user_id_fkey;
alter table public.misc_expense_records add constraint misc_expense_records_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

commit;

-- 사후검증(기대: 5줄 모두 ON DELETE SET NULL)
-- select conrelid::regclass, pg_get_constraintdef(oid)
-- from pg_constraint
-- where contype = 'f' and confrelid = 'public.profiles'::regclass
--   and conrelid::regclass::text in ('daily_logs','transport_details','fuel_records','maintenance_records','misc_expense_records');
-- 사후검증(기대: 5개 모두 YES)
-- select table_name, is_nullable from information_schema.columns
-- where table_schema = 'public' and column_name = 'user_id'
--   and table_name in ('daily_logs','transport_details','fuel_records','maintenance_records','misc_expense_records');
