-- 9-B-0: 연동 기사 앱의 개인정보 "사업자 정보·정산 계좌"는 차주가 입력한 값을 보기만 한다(docs/sot.md §0 "연동 기사 앱의 개인정보·설정").
-- 그 차주와 지금 연동 중인 기사 본인만 차주 이름·사업자 7칸·계좌 3칸을 조회한다(0002 get_linked_owner_profile_settings와 같은 조건).
-- 기사 앱 설정은 이제 기사 자기 프로필에서 읽으므로 차주 설정은 돌려주지 않는다. 기존 get_linked_owner_profile_settings는
-- 이미 배포된 화면이 새로고침 전까지 부를 수 있어 그대로 둔다.
-- 2026-10-01 Supabase SQL Editor에서 실행·검증함(AI가 사용자 지시로 실행). 멱등. 데이터 변경 없음.

begin;

create or replace function public.get_linked_owner_business_info(p_owner_id uuid)
returns table (
  name text, business_name text, business_representative text, business_number text, business_address text,
  business_type text, business_item text, business_email text, bank_name text, account_number text, account_holder text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.name, p.business_name, p.business_representative, p.business_number, p.business_address,
         p.business_type, p.business_item, p.business_email, p.bank_name, p.account_number, p.account_holder
    from public.profiles p
   where p.id = p_owner_id
     and exists (
       select 1 from public.driver_links dl
        where dl.owner_id = p_owner_id and dl.driver_id = auth.uid() and dl.status = 'linked'
     );
$$;
revoke all on function public.get_linked_owner_business_info(uuid) from public;
revoke execute on function public.get_linked_owner_business_info(uuid) from anon;
grant execute on function public.get_linked_owner_business_info(uuid) to authenticated;

commit;

-- 사후검증(읽기 전용)
-- select prosecdef, proconfig from pg_proc where proname = 'get_linked_owner_business_info';  -- true, {search_path=public}
-- select has_function_privilege('anon','public.get_linked_owner_business_info(uuid)','execute'),
--        has_function_privilege('authenticated','public.get_linked_owner_business_info(uuid)','execute');  -- false, true

-- 되돌리기: drop function public.get_linked_owner_business_info(uuid); (앱은 0002 함수로 되돌린 버전이어야 함)
