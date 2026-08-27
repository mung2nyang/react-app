// Step 0-4 감사 보완 4차: durable mutation outbox. 차량/거래처 삭제(tombstone)와 기사
// 상태변경/삭제/초대 생성·수정(mutation)을 "로컬 반영과 동시에" localStorage에 남겨서,
// 원격 호출이 실패하거나 새로고침이 일어나도 그 의도가 사라지지 않고 자동 재시도되게
// 한다. 여기는 순수 계산 + localStorage 읽기/키 계산만 담당 — 실제 쓰기는 호출부가
// atomicPersist.writeAllOrNothing으로, 도메인 값과 이 outbox 값을 "하나의" 쓰기로
// 묶어서 한다(사용자 지시 1번 — 원자성).
const OUTBOX_PREFIX = 'reactPracticeMutationOutbox'

export function outboxStorageKey(ownerKey) {
  return `${OUTBOX_PREFIX}:${ownerKey}`
}

/**
 * 사용자 지시 3번 — 기사 배정 기간 겹침처럼 "다시 시도해도 결과가 안 바뀌는" 확정
 * validation 실패를 표시한다. outboxFlush.js가 이 표시가 있는 에러는 durable
 * 재시도 대상에서 제외하고(outbox에서 제거) 조용히 포기한다 — 영원히 재시도하며
 * 콘솔만 채우지 않는다.
 * @param {string} message
 * @returns {Error & { permanent: true }}
 */
export function createPermanentFailure(message) {
  const error = new Error(message)
  error.permanent = true
  return error
}

export function readOutbox(ownerKey) {
  try {
    const raw = localStorage.getItem(outboxStorageKey(ownerKey))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeOutbox(ownerKey, ops) {
  localStorage.setItem(outboxStorageKey(ownerKey), JSON.stringify(ops))
}

let opCounter = 0
/** @returns {string} 세션 내에서 유일한 operation id. */
function nextOpId(resourceType, resourceId) {
  opCounter += 1
  return `${resourceType}:${resourceId}:${Date.now().toString(36)}:${opCounter}`
}

/**
 * @param {{ ownerKey: string, userId: string, resourceType: 'vehicle'|'client'|'driverLink', resourceId: string, operation: string, payload?: object, sessionEpoch: number }} params
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

/** @param {{ ownerKey: string, userId: string, resourceType: string, resourceId: string, operation: string, payload?: object, sessionEpoch: number }} params */
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
 * 새 mutation은 버린다 — 삭제 의도가 더 강한 의도라고 본다.
 * @param {Array<object>} existingOps
 * @param {object} newOp
 * @returns {Array<object>}
 */
export function mergeOutboxOp(existingOps, newOp) {
  const sameResource = (op) => op.resourceType === newOp.resourceType && op.resourceId === newOp.resourceId
  const others = existingOps.filter((op) => !sameResource(op))
  const existingForResource = existingOps.filter(sameResource)
  const hasExistingTombstone = existingForResource.some((op) => op.kind === 'tombstone')

  if (newOp.kind === 'tombstone') return [...others, newOp]
  if (hasExistingTombstone) return existingOps // 삭제가 이미 대기 중 — 새 mutation은 버린다.
  return [...others, newOp] // 같은 리소스의 이전 mutation은 최신 것으로 교체(latest wins).
}

/**
 * newOp를 기존 outbox에 병합한 "다음 값"을 { key, value } 쌍으로 돌려준다 — 쓰지 않는다.
 * 호출부가 도메인 값 쓰기와 함께 writeAllOrNothing 한 번에 넣는다.
 * @param {string} ownerKey
 * @param {object} newOp
 * @returns {{ key: string, value: Array<object> }}
 */
export function planOutboxAppend(ownerKey, newOp) {
  const next = mergeOutboxOp(readOutbox(ownerKey), newOp)
  return { key: outboxStorageKey(ownerKey), value: next }
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

export function getPendingOps(ownerKey) {
  return readOutbox(ownerKey)
}

export function hasPendingOps(ownerKey) {
  return readOutbox(ownerKey).length > 0
}

/** @returns {boolean} 이 리소스에 대한 삭제(tombstone)가 아직 대기 중이면 true. */
export function isTombstoned(ownerKey, resourceType, resourceId) {
  if (!resourceId) return false
  return readOutbox(ownerKey).some((op) => op.kind === 'tombstone' && op.resourceType === resourceType && op.resourceId === resourceId)
}

/** @returns {object|null} 이 리소스에 대한 대기 중인(비삭제) mutation, 없으면 null. */
export function getPendingMutation(ownerKey, resourceType, resourceId) {
  if (!resourceId) return null
  return readOutbox(ownerKey).find((op) => op.kind === 'mutation' && op.resourceType === resourceType && op.resourceId === resourceId) || null
}
