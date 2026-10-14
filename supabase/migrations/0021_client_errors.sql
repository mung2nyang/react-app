-- 55-B: 앱에서 난 오류를 모으는 표. 로그인 사용자만 자기 id로 넣을 수 있고, 앱에서는 아무도 읽기·고치기·지우기 못 한다(보리는 Supabase 관리 화면에서 봄).
-- 보리 결정 2026-10-14: 우리 Supabase에 모은다, 로그인 사용자만. 처리방침(10-P)에 "앱 오류 기록" 항목 넣을 것.
-- 2026-10-14 Supabase SQL Editor에서 실행·검증함(AI가 사용자 지시로 실행). 이 파일은 그 기록이다.
-- if not exists / drop policy if exists라 다시 실행해도 안전하다(데이터 변경 없음).

begin;

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('render', 'error', 'unhandledrejection')),
  message text not null default '' check (char_length(message) <= 500),
  stack text not null default '' check (char_length(stack) <= 2000),
  path text not null default '' check (char_length(path) <= 300),
  user_agent text not null default '' check (char_length(user_agent) <= 200)
);

alter table public.client_errors enable row level security;

drop policy if exists "본인 오류 기록 넣기" on public.client_errors;
create policy "본인 오류 기록 넣기" on public.client_errors
  for insert to authenticated
  with check (user_id = auth.uid());

revoke all on public.client_errors from anon;
revoke all on public.client_errors from authenticated;
grant insert on public.client_errors to authenticated;

commit;

-- 사후검증 1(기대: rls true, 정책 1개 "본인 오류 기록 넣기" INSERT, authenticated 권한은 INSERT만, anon 없음)
-- select relrowsecurity from pg_class where oid = 'public.client_errors'::regclass;
-- select policyname, cmd, roles::text, with_check from pg_policies where tablename = 'client_errors';
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'client_errors' and grantee in ('anon', 'authenticated');
