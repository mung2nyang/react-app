// @ts-check
// driverLink/upsert 병합: 최초 op의 id와 previousDriverSnapshot은 이어받고 배정 내용만 최신으로 —
// 매번 교체하면 확정 실패 때 처음(A)이 아니라 중간 값(B)으로 롤백되고, id가 바뀌면 flush 결과를 못 찾는다.
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
