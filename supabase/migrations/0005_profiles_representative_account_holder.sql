-- 0-2: 개인정보의 대표자명·예금주를 서버에 저장·복원하기 위한 칸 추가.
-- 2026-09-24 Supabase SQL Editor에서 이미 실행·검증함(확인 쿼리 2행: account_holder, business_representative).
-- 이 파일은 그 기록이다. 멱등이라 다시 실행해도 안전하다(데이터·정책 무변경).
-- 기사용 함수 get_linked_owner_profile_settings(0002)는 이 칸을 돌려주지 않으므로 연동 기사에게 노출되지 않는다.

begin;

alter table public.profiles add column if not exists business_representative text;
alter table public.profiles add column if not exists account_holder text;

commit;

-- 사후검증(기대: 2행)
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'profiles'
--   and column_name in ('business_representative', 'account_holder')
-- order by column_name;
