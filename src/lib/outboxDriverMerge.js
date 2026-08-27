// @ts-check
// 재감사 항목 1 — mutationOutbox.js에서 분리(200줄 제한). driverLink/upsert가
// 확정되기 전에 여러 번 편집되면(A→B→C), "최신 것으로 교체"가 매번 이전 op을
// 통째로 버려서 previousDriverSnapshot도 최신 op의 것(직전 낙관적 값, 서버가
// 확인한 적 없는 값)으로 바뀌어 버렸다 — 나중에 확정 실패가 나면 A가 아니라 B로
// 롤백되는 오류였다. 같은 리소스의 upsert끼리 병합할 때는 최초 op의 id와
// payload.previousDriverSnapshot을 그대로 이어받고, 나머지 필드(실제 배정 내용)만
// 최신 것으로 갱신한다 — id를 보존해야 outboxCommit.js가 flush 결과 맵에서 "이
// 병합된 op"을 정확히 찾을 수 있다(planOutboxAppend가 이 병합 결과를 effectiveOp로
// 그대로 돌려준다).
/** @typedef {import('./outboxTypes.js').OutboxOp} OutboxOp */

/**
 * @param {OutboxOp} existing
 * @param {OutboxOp} incoming
 * @returns {OutboxOp}
 */
export function mergeDriverUpsert(existing, incoming) {
  if (existing.resourceType !== 'driverLink' || existing.operation !== 'upsert') return incoming
  if (incoming.resourceType !== 'driverLink' || incoming.operation !== 'upsert') return incoming
  return {
    ...incoming,
    id: existing.id,
    payload: { ...incoming.payload, previousDriverSnapshot: existing.payload.previousDriverSnapshot ?? null },
  }
}
