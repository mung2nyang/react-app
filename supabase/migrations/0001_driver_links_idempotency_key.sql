-- driver_links 신규 insert: idempotency_key + owner 단위 고유 인덱스 + 원자적 RPC.
--
-- 라이브 스키마 확정(2026-08-31, 사용자 SELECT 회신):
--   id uuid PK, owner_id uuid, driver_id uuid, vehicle_id uuid (bigint 아님),
--   invite_code text UNIQUE, status text, assignment_start/end date,
--   RLS 켜짐. upsert_driver_link_idempotent 없음. idempotency_key 없음.
--
-- 라이브 적용·사후 검증 완료. 클라이언트는 requestDriverInviteSave → upsertDriverLinkViaRpc.

begin;

alter table public.driver_links
  add column if not exists idempotency_key text;

create unique index if not exists driver_links_owner_idempotency_key_key
  on public.driver_links (owner_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.upsert_driver_link_idempotent(
  p_idempotency_key text,
  p_vehicle_id uuid,
  p_invite_code text,
  p_assignment_start date,
  p_assignment_end date
) returns setof public.driver_links
language plpgsql
security invoker
as $$
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'p_idempotency_key must not be null or blank'
      using errcode = '22023';
  end if;

  return query
  insert into public.driver_links
    (idempotency_key, owner_id, vehicle_id, invite_code, assignment_start, assignment_end, status, updated_at)
  values
    (p_idempotency_key, auth.uid(), p_vehicle_id, p_invite_code, p_assignment_start, p_assignment_end, 'pending', now())
  on conflict (owner_id, idempotency_key) where idempotency_key is not null do update
    set idempotency_key = excluded.idempotency_key
  returning *;
end;
$$;

comment on function public.upsert_driver_link_idempotent(text, uuid, text, date, date) is
  'driver_links 신규 insert를 (owner_id, idempotency_key) 기준으로 원자적으로 get-or-create. owner_id는 auth.uid(). vehicle_id는 uuid.';

revoke all on function public.upsert_driver_link_idempotent(text, uuid, text, date, date) from public;
revoke execute on function public.upsert_driver_link_idempotent(text, uuid, text, date, date) from anon;
grant execute on function public.upsert_driver_link_idempotent(text, uuid, text, date, date) to authenticated;

commit;
