// @ts-check
// 4차 재작업(사용자 지시 1/5번): outboxFlush.js에서 분리(200줄 제한) — 기사 upsert
// op 하나의 "로컬 drivers 도메인 쓰기 + outbox 제거"를 원자적으로 묶는 두 경로만
// 담당한다. 성공(reconcile)과 확정 실패(rollback) 둘 다 같은 모양(writeAllOrNothing
// + commitBatch)이라 여기 함께 둔다 — hydrate 시점 재적용은 outboxReconcile.js가
// 별도로 맡는다(책임이 다르다: 여긴 outbox flush 응답 처리, 그쪽은 hydrate 병합).
/** @typedef {import('./outboxTypes.js').OutboxOp} OutboxOp */
/** @typedef {import('./outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {import('./outboxTypes.js').DriverLinkRow} DriverLinkRow */
import { KEYS, keyFor, readJson } from './cloudStorage.js'
import { writeAllOrNothing } from '../store/atomicPersist.js'
import { commitBatch } from '../store/app-store.js'
import { getPendingOps, outboxStorageKey } from './mutationOutbox.js'

/** @param {string} ownerKey */
function readDrivers(ownerKey) {
  return /** @type {Array<DriverRecord>} */ (readJson(keyFor(KEYS.drivers, ownerKey), []))
}

/**
 * @param {string} ownerKey
 * @param {string} opId
 * @param {Array<DriverRecord>} nextDrivers
 */
function writeDriversAndRemoveOp(ownerKey, opId, nextDrivers) {
  const remainingOps = getPendingOps(ownerKey).filter((pending) => pending.id !== opId)
  writeAllOrNothing([
    { key: keyFor(KEYS.drivers, ownerKey), value: nextDrivers },
    { key: outboxStorageKey(ownerKey), value: remainingOps },
  ])
  commitBatch([{ domain: 'drivers', ownerKey, value: nextDrivers }], { persist: false, syncToCloud: false })
}

/**
 * upsert 성공 후 로컬 drivers 배열에 서버가 확정한 supabaseId/inviteCode 등을
 * 되반영하고, 그 쓰기와 outbox 제거를 하나의 원자적 쓰기로 묶는다(사용자 지시
 * 5번). localStorage뿐 아니라 Store(app-store.js) 상태도 갱신한다.
 * @param {OutboxOp} op
 * @param {DriverLinkRow} savedRow
 */
export function reconcileDriverAfterUpsertAndRemoveOp(op, savedRow) {
  const { ownerKey } = op
  const drivers = readDrivers(ownerKey)
  const nextDrivers = drivers.map((driver) => (driver.id === op.resourceId ? {
    ...driver,
    supabaseId: savedRow.id,
    inviteCode: savedRow.invite_code,
    startDate: savedRow.assignment_start || driver.startDate,
    endDate: savedRow.assignment_end || driver.endDate || '',
    status: /** @type {'pending'|'linked'} */ (savedRow.status === 'linked' ? 'linked' : driver.status),
  } : driver))
  writeDriversAndRemoveOp(ownerKey, op.id, nextDrivers)
}

/**
 * 4차 재작업(사용자 지시 1번) — 기사 upsert가 확정 실패(예: 배정 기간 겹침)로
 * 끝나면, 커밋 시점에 낙관적으로 반영했던 drivers 값을 원래 상태로 되돌린다.
 * `op.payload.previousDriverSnapshot`이 있으면(기존 기사 수정) 그 스냅샷으로
 * 되돌리고, 없으면(신규 초대 생성) 이 리소스 자체를 배열에서 제거한다 — 둘 다
 * "이번 op이 없었던 것처럼" 만드는 것과 같다. 그 사이 다른 기사에 생긴 변경은
 * 건드리지 않는다(전체 스냅샷을 덮어쓰지 않고, 이 resourceId 하나만 되돌린다).
 * @param {OutboxOp} op
 */
export function rollbackDriverUpsertAndRemoveOp(op) {
  const { ownerKey } = op
  const drivers = readDrivers(ownerKey)
  const previous = op.payload?.previousDriverSnapshot ?? null
  const nextDrivers = previous
    ? drivers.map((driver) => (driver.id === op.resourceId ? previous : driver))
    : drivers.filter((driver) => driver.id !== op.resourceId)
  writeDriversAndRemoveOp(ownerKey, op.id, nextDrivers)
}
