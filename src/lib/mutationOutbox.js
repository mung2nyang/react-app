// @ts-check
// Step 0-4 감사 보완 4차: durable mutation outbox. 차량/거래처 삭제(tombstone)와 기사
// 상태변경/삭제/초대 생성·수정(mutation)을 "로컬 반영과 동시에" localStorage에 남겨서,
// 원격 호출 실패/새로고침에도 그 의도가 사라지지 않고 자동 재시도되게 한다. 여기는
// 순수 계산 + localStorage 읽기/키 계산만 — 실제 쓰기는 호출부가 writeAllOrNothing으로
// 도메인 값과 함께 원자적으로 한다. 타입은 outboxTypes.js에서 import만 한다.
/** @typedef {import('./outboxTypes.js').OutboxResourceType} OutboxResourceType */
/** @typedef {import('./outboxTypes.js').OutboxPayload} OutboxPayload */
/** @typedef {import('./outboxTypes.js').OutboxOp} OutboxOp */
import { mergeDriverUpsert } from './outboxDriverMerge.js'
import { PermanentFailureError } from './outboxErrors.js'

const OUTBOX_PREFIX = 'reactPracticeMutationOutbox'

/**
 * 4차 재작업(사용자 지시 1번) — "outbox에 남아 있는지"로 성공을 간접 추론하지 않고
 * 이 네 가지로 명시한다: success(반영 확정, 제거됨) / retryable(일시적 실패, 그대로
 * 남아 다음 flush가 잇는다) / permanentFailure(확정 실패, 제거+낙관값 롤백) /
 * staleSession(로그아웃/owner 전환 중, 아무것도 안 건드리고 op 보존).
 */
export const OUTBOX_RESULT = Object.freeze({
  SUCCESS: /** @type {'success'} */ ('success'),
  RETRYABLE: /** @type {'retryable'} */ ('retryable'),
  PERMANENT_FAILURE: /** @type {'permanentFailure'} */ ('permanentFailure'),
  STALE_SESSION: /** @type {'staleSession'} */ ('staleSession'),
})

/** @typedef {typeof OUTBOX_RESULT[keyof typeof OUTBOX_RESULT]} OutboxResultStatus */

/** @param {string} ownerKey */
export function outboxStorageKey(ownerKey) {
  return `${OUTBOX_PREFIX}:${ownerKey}`
}

/**
 * 사용자 지시 3번 — 기사 배정 기간 겹침처럼 "다시 시도해도 결과가 안 바뀌는" 확정
 * validation 실패를 표시한다. outboxFlush.js가 `instanceof PermanentFailureError`로
 * 이 에러를 구분해 durable 재시도 대상에서 제외하고(outbox에서 제거) 조용히
 * 포기한다 — 영원히 재시도하며 콘솔만 채우지 않는다.
 * @param {string} message
 * @returns {PermanentFailureError}
 */
export function createPermanentFailure(message) {
  return new PermanentFailureError(message)
}

/** @param {string} ownerKey @returns {Array<OutboxOp>} */
export function readOutbox(ownerKey) {
  try {
    const raw = localStorage.getItem(outboxStorageKey(ownerKey))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** @param {string} ownerKey @param {Array<OutboxOp>} ops */
function writeOutbox(ownerKey, ops) {
  localStorage.setItem(outboxStorageKey(ownerKey), JSON.stringify(ops))
}

let opCounter = 0
/**
 * @param {OutboxResourceType} resourceType
 * @param {string} resourceId
 * @returns {string} 세션 내에서 유일한 operation id.
 */
function nextOpId(resourceType, resourceId) {
  opCounter += 1
  return `${resourceType}:${resourceId}:${Date.now().toString(36)}:${opCounter}`
}

/**
 * @param {{ ownerKey: string, userId: string, resourceType: OutboxResourceType, resourceId: string, operation: string, payload?: OutboxPayload, sessionEpoch: number }} params
 * @returns {OutboxOp}
 */
export function buildTombstoneOp({ ownerKey, userId, resourceType, resourceId, operation, payload = {}, sessionEpoch }) {
  return {
    id: nextOpId(resourceType, resourceId),
    ownerKey,
    userId,
    resourceType,
    resourceId,
    kind: 'tombstone',
    operation,
    payload,
    sessionEpoch,
    createdAt: new Date().toISOString(),
  }
}

/**
 * @param {{ ownerKey: string, userId: string, resourceType: OutboxResourceType, resourceId: string, operation: string, payload?: OutboxPayload, sessionEpoch: number }} params
 * @returns {OutboxOp}
 */
export function buildMutationOp({ ownerKey, userId, resourceType, resourceId, operation, payload = {}, sessionEpoch }) {
  return {
    id: nextOpId(resourceType, resourceId),
    ownerKey,
    userId,
    resourceType,
    resourceId,
    kind: 'mutation',
    operation,
    payload,
    sessionEpoch,
    createdAt: new Date().toISOString(),
  }
}

/**
 * 같은 (resourceType, resourceId)에 대한 기존 작업들과 newOp를 병합한다 — 순수 함수,
 * 쓰지 않는다. tombstone은 그 리소스에 대한 다른 모든 대기 작업을 대체한다(삭제가
 * 이전 상태변경/생성을 무의미하게 만든다). 이미 tombstone이 대기 중인 리소스에
 * mutation이 새로 들어오면(삭제 후 재편집 같은 비정상 경로) tombstone을 우선하고
 * 새 mutation은 버린다 — 삭제 의도가 더 강한 의도라고 본다. driverLink/upsert끼리는
 * mergeDriverUpsert로 최초 op의 id/previousDriverSnapshot을 보존한다(재감사 1번).
 * @param {Array<OutboxOp>} existingOps
 * @param {OutboxOp} newOp
 * @returns {Array<OutboxOp>}
 */
export function mergeOutboxOp(existingOps, newOp) {
  const sameResource = (/** @type {OutboxOp} */ op) => op.resourceType === newOp.resourceType && op.resourceId === newOp.resourceId
  const others = existingOps.filter((op) => !sameResource(op))
  const existingForResource = existingOps.filter(sameResource)
  const hasExistingTombstone = existingForResource.some((op) => op.kind === 'tombstone')

  if (newOp.kind === 'tombstone') return [...others, newOp]
  if (hasExistingTombstone) return existingOps // 삭제가 이미 대기 중 — 새 mutation은 버린다.
  const existingMutation = existingForResource.find((op) => op.kind === 'mutation')
  const effective = existingMutation ? mergeDriverUpsert(existingMutation, newOp) : newOp
  return [...others, effective] // 같은 리소스의 이전 mutation은 최신 것으로 교체(latest wins) — 단, upsert는 위 예외.
}

/**
 * newOp를 기존 outbox에 병합한 "다음 값"을 { key, value } 쌍으로 돌려준다 — 쓰지 않는다.
 * 호출부가 도메인 값 쓰기와 함께 writeAllOrNothing 한 번에 넣는다.
 *
 * effectiveOp: 실제로 outbox에 반영된(병합 후) op — driverLink/upsert 병합(재감사
 * 1번)은 newOp가 아니라 최초 op의 id를 그대로 쓰므로, 호출부(outboxCommit.js)가
 * flush 결과 맵에서 자신이 만든 newOp.id로 찾으면 못 찾는다. 항상 이 effectiveOp.id로
 * 찾아야 한다.
 * @param {string} ownerKey
 * @param {OutboxOp} newOp
 * @returns {{ key: string, value: Array<OutboxOp>, effectiveOp: OutboxOp }}
 */
export function planOutboxAppend(ownerKey, newOp) {
  const next = mergeOutboxOp(readOutbox(ownerKey), newOp)
  const effectiveOp = next.find((op) => op.resourceType === newOp.resourceType && op.resourceId === newOp.resourceId) ?? newOp
  return { key: outboxStorageKey(ownerKey), value: next, effectiveOp }
}

/**
 * 원격 반영이 확정된 뒤에만 부른다. 이 제거 자체가 실패해도(예: 저장 공간 문제) 그냥
 * 두면 된다 — 다음 flush가 이미 끝난 작업을 다시 실행하게 되지만, 실행기가
 * idempotent하게 설계돼 있으므로(delete-of-already-deleted-row 등) 데이터가 깨지지
 * 않는다.
 * @param {string} ownerKey
 * @param {string} opId
 */
export function removeOutboxOp(ownerKey, opId) {
  const next = readOutbox(ownerKey).filter((op) => op.id !== opId)
  writeOutbox(ownerKey, next)
}

/** @param {string} ownerKey @returns {Array<OutboxOp>} */
export function getPendingOps(ownerKey) {
  return readOutbox(ownerKey)
}

/** @param {string} ownerKey */
export function hasPendingOps(ownerKey) {
  return readOutbox(ownerKey).length > 0
}

/**
 * @param {string} ownerKey
 * @param {OutboxResourceType} resourceType
 * @param {string} resourceId
 * @returns {boolean} 이 리소스에 대한 삭제(tombstone)가 아직 대기 중이면 true.
 */
export function isTombstoned(ownerKey, resourceType, resourceId) {
  if (!resourceId) return false
  return readOutbox(ownerKey).some((op) => op.kind === 'tombstone' && op.resourceType === resourceType && op.resourceId === resourceId)
}

/**
 * @param {string} ownerKey
 * @param {OutboxResourceType} resourceType
 * @param {string} resourceId
 * @returns {OutboxOp|null} 이 리소스에 대한 대기 중인(비삭제) mutation, 없으면 null.
 */
export function getPendingMutation(ownerKey, resourceType, resourceId) {
  if (!resourceId) return null
  return readOutbox(ownerKey).find((op) => op.kind === 'mutation' && op.resourceType === resourceType && op.resourceId === resourceId) || null
}
