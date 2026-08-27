-- 4차 재작업 재감사(사용자 지시 4번, +SQL 재재감사) — driver_links 신규 insert의
-- 서버 행 중복 방지 안전장치를 컬럼 + owner 단위 고유 제약 + 원자적 RPC로 완성한다.
--
-- 문제: 클라이언트가 재시도할 때 쓰는 자연키(vehicle_id, assignment_start,
-- invite_code)는 invite_code가 23505 충돌로 재발급되면 더 이상 "같은 시도"를
-- 알아보지 못한다 — 재발급된 코드는 outbox op의 payload에 반영되지 않기 때문이다.
-- (src/lib/directMutations.js의 findExistingDriverLinkInsert 주석 참고.)
--
-- 정정: 이 마이그레이션 이전 버전의 클라이언트 코드/테스트 설명에서 자연키 조회를
-- "완전한 멱등성"이라고 적었던 것은 부정확했다 — 그건 재발급 레이스를 못 닫는
-- 부분적 안전장치였다. 정확한 표현은 "서버 행 중복 삽입을 막는 안전장치"다(겹침
-- 검사가 항상 살아 있어 중복 INSERT 자체는 막지만, 그 안전장치가 "확정 실패"로
-- 오판해 로컬을 롤백하는 부작용은 남는다 — 이 마이그레이션이 그 부작용까지 없앤다).
--
-- 해결: op.id(클라이언트가 생성하는, 재시도 내내 절대 안 바뀌는 문자열)를
-- idempotency_key로 저장하고 고유 제약을 건다. 재시도는 이 컬럼으로 "내가 이미
-- 성공시켰는지"를 무조건 정확하게 판정할 수 있다 — invite_code가 바뀌어도 무관하다.
-- 조회와 삽입을 하나의 RPC(원자적 트랜잭션)로 묶어 조회-후-삽입 사이의 레이스도 없앤다.
--
-- ============================================================================
-- 상태: 실행 가능한 SQL로 작성했으나, 라이브 DB에는 미적용·미검증이다.
-- ============================================================================
-- "실제로 실행해서 통과를 확인했다"는 뜻이 아니다 — Claude는 이 SQL을 라이브
-- 프로젝트에 실행할 방법이 없다(Supabase CLI/DB 자격증명 없음, 되돌리기 어려운
-- 프로덕션 스키마 변경이라 사용자 승인 없이는 어차피 실행하지 않는다). 아래는
-- 문법·논리를 정적으로 검토해 작성한 것이지, 실제 Postgres/Supabase 인스턴스에
-- 대고 돌려 본 적은 없다. 사람이 스테이징 등에서 먼저 실행해 확인하길 권한다.
--
-- 적용 방법:
--   - Supabase 대시보드의 SQL Editor에 이 파일 전체를 붙여넣어 실행하거나,
--     `supabase db push`(프로젝트 링크 후)로 적용하세요.
--   - vehicle_id 등의 실제 컬럼 타입은 이 코드베이스가 JS에서 다루는 값(숫자
--     PK로 보임)에서 추론했다 — 실제 운영 스키마의 컬럼 타입과 다르면 아래
--     `bigint`를 실제 타입으로 맞춰 고친 뒤 실행하세요(예: `\d public.driver_links`).
--   - 적용 후에도 클라이언트 코드(findExistingDriverLinkInsert/
--     upsertDriverLinkOnSupabase)는 이 RPC를 아직 호출하지 않는다 — 사용자가
--     마이그레이션을 실제로 적용했다고 확인해 준 뒤에만 그 연결 작업을 진행한다
--     (마이그레이션 전에 클라이언트가 존재하지 않는 컬럼/RPC를 부르면 그 자체로
--     전체 기능이 깨진다).
--   - 이 RPC는 "같은 idempotency_key로 다시 불러도 안전하게 수렴한다"만
--     책임진다 — 겹치는 배정 기간 검증(overlap check)은 여전히 클라이언트가
--     RPC 호출 *전에* 별도로 한다(findOverlappingDriverLinkOnSupabase). 그
--     사전 검사와 이 RPC 사이의 아주 좁은 TOCTOU 레이스는 이 마이그레이션의
--     범위 밖이다(기존 문서의 알려진 한계로 남는다).

alter table public.driver_links
  add column if not exists idempotency_key text;

-- SQL 재재감사 1번: idempotency_key 하나만 고유하게 걸면 서로 다른 owner가 우연히
-- 같은 op.id 형식 문자열을 만들 가능성(낮지만 0은 아니다 — op.id는 클라이언트
-- 시각+카운터로 만들어질 뿐 owner를 섞지 않는다)에 대해 다른 owner의 요청과 충돌할
-- 수 있었다. owner 단위로 격리한 복합 고유 인덱스로 바꾼다 — 같은 owner 안에서만
-- idempotency_key가 유일하면 된다.
create unique index if not exists driver_links_owner_idempotency_key_key
  on public.driver_links (owner_id, idempotency_key)
  where idempotency_key is not null;

-- 원자적 get-or-create RPC: idempotency_key가 이미 있으면 그 기존 행을 그대로
-- 돌려주고(재시도가 응답만 유실됐던 성공을 재사용), 없으면 새로 삽입한다. 삽입과
-- 조회 사이의 레이스는 INSERT ... ON CONFLICT가 DB 트랜잭션/락으로 원자적으로
-- 처리하므로, 같은 (owner_id, idempotency_key)로 동시에 여러 번 불려도(네트워크
-- 재시도 폭주 등) 정확히 한 행만 남는다.
--
-- SQL 재재감사 3번: p_owner_id를 매개변수로 받지 않는다(가장 안전한 방법을 그대로
-- 택했다) — 호출자가 임의의 owner_id를 지정해 다른 사람 행세를 할 수 없도록,
-- 현재 요청의 auth.uid()를 그대로 owner_id로 쓴다.
--
-- SQL 재재감사 4번: security invoker를 유지한다 — 이 함수는 호출자 권한으로
-- 실행되므로 driver_links에 이미 걸려 있는 RLS 정책이 이 INSERT/UPDATE에도
-- 그대로 적용된다(예: "본인 owner_id 행만 쓸 수 있다"는 기존 정책). 함수
-- 자체가 RLS를 우회하는 권한 상승 통로가 되지 않는다.
create or replace function public.upsert_driver_link_idempotent(
  p_idempotency_key text,
  p_vehicle_id bigint,
  p_invite_code text,
  p_assignment_start date,
  p_assignment_end date
) returns setof public.driver_links
language plpgsql
security invoker
as $$
begin
  -- SQL 재재감사 2번: 빈 idempotency_key로는 절대 진행하지 않는다 — null/공백을
  -- 그대로 흘려보내면 여러 서로 다른 삽입 시도가 전부 "idempotency_key가 없다"는
  -- 같은 상태로 취급돼(부분 인덱스가 null은 걸러내므로 고유 제약이 아예 안 걸린다)
  -- 이 함수가 존재하는 이유(멱등성 판정) 자체가 무력화된다.
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'p_idempotency_key must not be null or blank'
      using errcode = '22023'; -- invalid_parameter_value
  end if;

  return query
  insert into public.driver_links
    (idempotency_key, owner_id, vehicle_id, invite_code, assignment_start, assignment_end, status, updated_at)
  values
    (p_idempotency_key, auth.uid(), p_vehicle_id, p_invite_code, p_assignment_start, p_assignment_end, 'pending', now())
  on conflict (owner_id, idempotency_key) where idempotency_key is not null do update
    -- 실제로는 아무 값도 안 바꾸는 "no-op update" — ON CONFLICT DO NOTHING은
    -- RETURNING과 함께 쓰면 충돌 시 행을 하나도 안 돌려주므로, 기존 행을 그대로
    -- 돌려주려면 DO UPDATE가 필요하다(자기 자신을 자기 값으로 다시 대입).
    set idempotency_key = excluded.idempotency_key
  returning *;
end;
$$;

comment on function public.upsert_driver_link_idempotent(text, bigint, text, date, date) is
  '재감사 4번(+SQL 재재감사): driver_links 신규 insert를 (owner_id, idempotency_key) 기준으로 원자적으로 get-or-create한다. owner_id는 auth.uid()로 강제되어 호출자가 임의 지정할 수 없다. invite_code가 23505 충돌로 재발급돼도 같은 시도를 정확히 알아본다.';

-- SQL 재재감사 4번: 함수 실행 권한을 명시적으로 좁힌다. Supabase는 새 함수에
-- anon/authenticated/service_role에게 기본으로 EXECUTE를 부여하는 경우가 있어,
-- 로그인하지 않은(anon) 요청도 이 함수를 부를 수 있는 상태로 남을 수 있다 —
-- 명시적으로 PUBLIC/anon의 권한을 회수하고 authenticated에만 부여한다.
revoke all on function public.upsert_driver_link_idempotent(text, bigint, text, date, date) from public;
revoke execute on function public.upsert_driver_link_idempotent(text, bigint, text, date, date) from anon;
grant execute on function public.upsert_driver_link_idempotent(text, bigint, text, date, date) to authenticated;
