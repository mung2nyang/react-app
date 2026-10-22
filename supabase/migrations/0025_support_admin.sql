-- 0025: 고객센터 문의 관리자(로드맵 23-A). 관리자는 admin_users 명단으로만 정하고, 관리자 함수로만 모든 문의를 읽고 답변을 저장한다. 일반 사용자는 본인 문의 넣기·읽기만.
-- 명단 넣기는 이 파일에 없다 — SQL Editor에서 계정 id로 한 줄 넣는다(메일 주소를 저장소에 남기지 않으려고).
begin;

-- 문의 표는 이관 기록 없이 만들어져 있었다. 2026-10-22 조회 결과 그대로 적는다(이미 있으면 안 바뀜).
create table if not exists public.support_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text,
  title text,
  content text,
  status text default 'open',
  answer text,
  answered_at timestamptz,
  raw jsonb,
  created_at timestamptz default now()
);
alter table public.support_inquiries enable row level security;

-- 사용자가 본인 줄의 답변 칸을 채울 수 있던 수정 정책을 없애고, 넣기 칸을 앱이 쓰는 5개로 묶는다.
drop policy if exists "본인 문의만 수정" on public.support_inquiries;
drop policy if exists "본인 문의만 작성" on public.support_inquiries;
create policy "본인 문의만 작성" on public.support_inquiries
  for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "본인 문의만 조회" on public.support_inquiries;
create policy "본인 문의만 조회" on public.support_inquiries
  for select to authenticated
  using (auth.uid() = user_id);

revoke all on public.support_inquiries from anon;
revoke all on public.support_inquiries from authenticated;
grant select on public.support_inquiries to authenticated;
grant insert (user_id, type, title, content, status) on public.support_inquiries to authenticated;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon;
revoke all on public.admin_users from authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

create or replace function public.admin_list_support_inquiries()
returns table (
  id uuid,
  type text,
  title text,
  content text,
  status text,
  answer text,
  answered_at timestamptz,
  created_at timestamptz,
  user_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 볼 수 있습니다.' using errcode = '42501';
  end if;
  return query
    select q.id, q.type, q.title, q.content, q.status, q.answer, q.answered_at, q.created_at, p.name
    from public.support_inquiries q
    left join public.profiles p on p.id = q.user_id
    order by (q.answer is null or btrim(q.answer) = '') desc, q.created_at desc;
end;
$$;

create or replace function public.admin_answer_support_inquiry(inquiry_id uuid, answer_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 답변할 수 있습니다.' using errcode = '42501';
  end if;
  if answer_text is null or btrim(answer_text) = '' then
    raise exception '답변 내용이 비어 있습니다.' using errcode = '22023';
  end if;
  update public.support_inquiries
     set answer = answer_text, status = 'answered', answered_at = now()
   where id = inquiry_id;
  if not found then
    raise exception '없는 문의입니다.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.is_admin() from public;
revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.admin_list_support_inquiries() from public;
revoke execute on function public.admin_list_support_inquiries() from anon;
grant execute on function public.admin_list_support_inquiries() to authenticated;
revoke all on function public.admin_answer_support_inquiry(uuid, text) from public;
revoke execute on function public.admin_answer_support_inquiry(uuid, text) from anon;
grant execute on function public.admin_answer_support_inquiry(uuid, text) to authenticated;

commit;

-- 사후검증 1(기대: 문의 표 정책 2개 "본인 문의만 작성" INSERT·"본인 문의만 조회" SELECT, 둘 다 {authenticated})
-- select policyname, cmd, roles::text from pg_policies where tablename = 'support_inquiries';
-- 사후검증 2(기대: 표 단위 권한은 authenticated SELECT 1줄만, 넣기 칸은 content·status·title·type·user_id 5개)
-- select grantee, privilege_type from information_schema.role_table_grants where table_name in ('support_inquiries', 'admin_users') and grantee in ('anon', 'authenticated');
-- select column_name from information_schema.column_privileges where table_name = 'support_inquiries' and grantee = 'authenticated' and privilege_type = 'INSERT';
-- 사후검증 3(기대: 명단 표 rls true, 정책 0개, 명단 넣은 뒤 1줄)
-- select relrowsecurity from pg_class where oid = 'public.admin_users'::regclass;
-- select count(*) from pg_policies where tablename = 'admin_users';
-- select count(*) from public.admin_users;
-- 사후검증 4(기대: 함수 3줄 모두 prosecdef true, anon_exec false, auth_exec true)
-- select proname, prosecdef, has_function_privilege('anon', oid, 'execute') anon_exec, has_function_privilege('authenticated', oid, 'execute') auth_exec from pg_proc where proname in ('is_admin', 'admin_list_support_inquiries', 'admin_answer_support_inquiry');
