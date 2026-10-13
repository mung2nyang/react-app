-- 37-B: 기사가 연동 중(driver_links.status = 'linked')인 차량은 삭제를 거절한다.
-- driver_links.vehicle_id가 ON DELETE CASCADE라 차량을 지우면 연동 기록이 말없이 사라지던 것을 막는다.
-- 앱(vehicleDeletion.js)에서도 먼저 막지만, 기사 목록이 늦은 기기·대기열 재시도·대시보드에서도 서버가 같은 문구로 거절한다.
-- 2026-10-13 Supabase SQL Editor에서 실행·검증함(AI가 사용자 지시로 실행). 이 파일은 그 기록이다.
-- create or replace / drop trigger if exists라 다시 실행해도 안전하다(데이터 변경 없음).

begin;

create or replace function public.guard_vehicle_delete_while_linked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.driver_links where vehicle_id = old.id and status = 'linked') then
    raise exception '기사가 연동된 차량은 삭제할 수 없습니다. 기사 관리에서 연동을 먼저 해제해 주세요.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists vehicles_guard_linked_delete on public.vehicles;
create trigger vehicles_guard_linked_delete
  before delete on public.vehicles
  for each row execute function public.guard_vehicle_delete_while_linked();

commit;

-- 사후검증 1(기대: vehicles_guard_linked_delete 1줄)
-- select tgname from pg_trigger where tgrelid = 'public.vehicles'::regclass and not tgisinternal;
-- 사후검증 2(기대: 위 문구 P0001 오류. DO 블록은 끝에서 항상 예외라 트리거가 안 걸려도 데이터 그대로) — 2026-10-13 기대대로 확인
-- do $$ begin delete from public.vehicles where id = (select vehicle_id from public.driver_links where status = 'linked' and vehicle_id is not null limit 1); raise exception 'TRIGGER_DID_NOT_FIRE_rolled_back'; end $$;
