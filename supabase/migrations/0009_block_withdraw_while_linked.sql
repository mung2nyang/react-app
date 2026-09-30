-- 7-A: 연동 중(driver_links.status = 'linked', 차주 또는 기사)이면 회원 탈퇴를 거절한다.
-- 앱 화면(PersonalInfoPage)에서도 먼저 막지만, 화면을 우회해도 서버가 같은 문구로 거절한다(앱은 서버 오류 문구를 그대로 토스트로 표시).
-- 2026-10-01 Supabase SQL Editor에서 실행·검증함(AI가 사용자 지시로 실행, 사후검증: 함수 본문에 연동 확인 후 삭제).
-- 이 파일은 그 기록이다. create or replace라 다시 실행해도 안전하다(이름·인자·보안 설정·실행 권한 유지, 데이터 변경 없음).
-- 7-C에서 "해제 요청 중" 상태가 생기면 그 상태도 연동 중으로 포함하도록 다시 고친다.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.driver_links
    where status = 'linked' and (owner_id = auth.uid() or driver_id = auth.uid())
  ) then
    raise exception '연동을 먼저 해제해야 탈퇴할 수 있습니다.' using errcode = 'P0001';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- 사후검증(기대: 위 본문)
-- select pg_get_functiondef('public.delete_own_account()'::regprocedure);
