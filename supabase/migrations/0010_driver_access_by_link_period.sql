-- 7-B: 연동 기사는 "지금 그 차량에 linked"이고 "그 날짜가 자기 연동 기간(linked·disconnected, 같은 차량)" 안일 때만 운행·비용 기록에 접근한다.
-- 새로 연동한 기사는 이전 기사 기간을 못 보고, 해제된 기사는 차주 차량 기록에 접근 못 한다("내가 쓴 행" 조건 제거). 차주는 "내 차량"으로 무변경.
-- 2026-10-01 Supabase SQL Editor에서 실행·검증함(AI가 사용자 지시로 실행). 멱등(create or replace + drop policy if exists → create policy).
-- 데이터 변경 없음, 앱 코드 변경 없음. 되돌리기 SQL은 파일 맨 아래 주석.

begin;

create or replace function public.driver_can_access_vehicle_date(p_vehicle_id uuid, p_work_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.driver_links cur
           where cur.driver_id = auth.uid() and cur.vehicle_id = p_vehicle_id and cur.status = 'linked'
         )
     and exists (
           select 1 from public.driver_links dl
           where dl.driver_id = auth.uid() and dl.vehicle_id = p_vehicle_id
             and dl.status in ('linked', 'disconnected')
             and (dl.assignment_start is null or p_work_date >= dl.assignment_start)
             and (dl.assignment_end is null or p_work_date <= dl.assignment_end)
         );
$$;

revoke all on function public.driver_can_access_vehicle_date(uuid, date) from public;
grant execute on function public.driver_can_access_vehicle_date(uuid, date) to authenticated;

drop policy if exists "운행기록 조회" on public.daily_logs;
create policy "운행기록 조회" on public.daily_logs for select using (
  vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
  or public.driver_can_access_vehicle_date(vehicle_id, work_date));
drop policy if exists "운행기록 작성" on public.daily_logs;
create policy "운행기록 작성" on public.daily_logs for insert with check (
  user_id = auth.uid() and (
    vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
    or public.driver_can_access_vehicle_date(vehicle_id, work_date)));
drop policy if exists "운행기록 수정" on public.daily_logs;
create policy "운행기록 수정" on public.daily_logs for update using (
  vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
  or public.driver_can_access_vehicle_date(vehicle_id, work_date));
drop policy if exists "운행기록 삭제" on public.daily_logs;
create policy "운행기록 삭제" on public.daily_logs for delete using (
  vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
  or public.driver_can_access_vehicle_date(vehicle_id, work_date));
drop policy if exists "linked driver reads own assigned vehicle daily_logs" on public.daily_logs;
create policy "linked driver reads own assigned vehicle daily_logs" on public.daily_logs for select using (public.driver_can_access_vehicle_date(vehicle_id, work_date));

drop policy if exists "콜상세 조회" on public.transport_details;
create policy "콜상세 조회" on public.transport_details for select using (
  vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
  or public.driver_can_access_vehicle_date(vehicle_id, work_date));
drop policy if exists "콜상세 작성" on public.transport_details;
create policy "콜상세 작성" on public.transport_details for insert with check (
  user_id = auth.uid() and (
    vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
    or public.driver_can_access_vehicle_date(vehicle_id, work_date)));
drop policy if exists "콜상세 수정" on public.transport_details;
create policy "콜상세 수정" on public.transport_details for update using (
  vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
  or public.driver_can_access_vehicle_date(vehicle_id, work_date));
drop policy if exists "콜상세 삭제" on public.transport_details;
create policy "콜상세 삭제" on public.transport_details for delete using (
  vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
  or public.driver_can_access_vehicle_date(vehicle_id, work_date));
drop policy if exists "linked driver reads own assigned vehicle transport_details" on public.transport_details;
create policy "linked driver reads own assigned vehicle transport_details" on public.transport_details for select using (public.driver_can_access_vehicle_date(vehicle_id, work_date));

drop policy if exists "유류기록 조회" on public.fuel_records;
create policy "유류기록 조회" on public.fuel_records for select using (
  vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
  or public.driver_can_access_vehicle_date(vehicle_id, work_date));
drop policy if exists "유류기록 작성" on public.fuel_records;
create policy "유류기록 작성" on public.fuel_records for insert with check (
  user_id = auth.uid() and (
    vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
    or public.driver_can_access_vehicle_date(vehicle_id, work_date)));
drop policy if exists "유류기록 수정" on public.fuel_records;
create policy "유류기록 수정" on public.fuel_records for update using (
  vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
  or public.driver_can_access_vehicle_date(vehicle_id, work_date));
drop policy if exists "유류기록 삭제" on public.fuel_records;
create policy "유류기록 삭제" on public.fuel_records for delete using (
  vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
  or public.driver_can_access_vehicle_date(vehicle_id, work_date));

drop policy if exists "정비기록 조회" on public.maintenance_records;
create policy "정비기록 조회" on public.maintenance_records for select using (
  vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
  or public.driver_can_access_vehicle_date(vehicle_id, work_date));
drop policy if exists "정비기록 작성" on public.maintenance_records;
create policy "정비기록 작성" on public.maintenance_records for insert with check (
  user_id = auth.uid() and (
    vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
    or public.driver_can_access_vehicle_date(vehicle_id, work_date)));
drop policy if exists "정비기록 수정" on public.maintenance_records;
create policy "정비기록 수정" on public.maintenance_records for update using (
  vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
  or public.driver_can_access_vehicle_date(vehicle_id, work_date));
drop policy if exists "정비기록 삭제" on public.maintenance_records;
create policy "정비기록 삭제" on public.maintenance_records for delete using (
  vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
  or public.driver_can_access_vehicle_date(vehicle_id, work_date));

drop policy if exists "기타지출 조회" on public.misc_expense_records;
create policy "기타지출 조회" on public.misc_expense_records for select using (
  vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
  or public.driver_can_access_vehicle_date(vehicle_id, work_date));
drop policy if exists "기타지출 작성" on public.misc_expense_records;
create policy "기타지출 작성" on public.misc_expense_records for insert with check (
  user_id = auth.uid() and (
    vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
    or public.driver_can_access_vehicle_date(vehicle_id, work_date)));
drop policy if exists "기타지출 수정" on public.misc_expense_records;
create policy "기타지출 수정" on public.misc_expense_records for update using (
  vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
  or public.driver_can_access_vehicle_date(vehicle_id, work_date));
drop policy if exists "기타지출 삭제" on public.misc_expense_records;
create policy "기타지출 삭제" on public.misc_expense_records for delete using (
  vehicle_id in (select v.id from public.vehicles v where v.user_id = auth.uid())
  or public.driver_can_access_vehicle_date(vehicle_id, work_date));

commit;

-- 사후검증(기대: 22행, 모두 driver_can_access_vehicle_date 포함, user_id = auth.uid()는 작성 규칙에만)
-- select tablename, policyname, cmd from pg_policies
-- where schemaname = 'public' and tablename in ('daily_logs','transport_details','fuel_records','maintenance_records','misc_expense_records')
--   and coalesce(qual, '') || coalesce(with_check, '') like '%driver_can_access_vehicle_date%';

-- 되돌리기(이전 조건): 각 규칙을 "(user_id = auth.uid()) OR (vehicle_id IN (SELECT vehicles.id FROM vehicles WHERE vehicles.user_id = auth.uid()))
-- OR (EXISTS (SELECT 1 FROM driver_links dl WHERE dl.vehicle_id = <표>.vehicle_id AND dl.driver_id = auth.uid() AND dl.status = 'linked'))"로,
-- 작성은 "(user_id = auth.uid()) AND (위 두 번째·세 번째 조건)"으로, "linked driver reads own assigned vehicle ..."는
-- "vehicle_id IN (SELECT driver_links.vehicle_id FROM driver_links WHERE driver_links.driver_id = auth.uid() AND driver_links.status = 'linked' AND driver_links.vehicle_id IS NOT NULL)"로 다시 만든다.
