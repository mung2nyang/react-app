// @ts-check
// Step 0-4 감사 보완 4차(+재작업): mutation outbox 실제 재시도 엔진. owner별
// running/dirty 큐(single-flight, 실행 중 새 op가 추가되면 한 번 더 돈 뒤에만
// resolve)로 flushMutationOutbox가 안전하게 여러 번 겹쳐 불려도 된다.
//
// 세션 재검증(사용자 지시 2/4번): flush 시작 시, 각 op 실행 *직전*, 그리고 모든
// 원격 await 직후(directMutations.js 내부까지) — 전부 isSessionStillCurrent()로
// 재확인한다. 하나라도 달라졌으면 남은 op/현재 op의 로컬 반영을 전부 건너뛰고
// 조용히 멈춘다. `.staleSession` 표시가 된 에러(cloudSession.assertSessionStillCurrent)
// 하나로 이 판단을 통일한다 — 어디서 감지됐든 flushOnce가 같은 방식으로 처리한다.
//
// 명시적 결과(사용자 지시 1번): flushOnce가 "outbox에 남아 있는지"로 성공을 간접
// 추론하지 않고, op마다 OUTBOX_RESULT 값을 담은 Map을 돌려준다. flushMutationOutbox가
// 이걸 그대로 호출부(outboxCommit.js)에 전달한다.
//
// 확정 실패(사용자 지시 3번): 기사 배정 기간 겹침처럼 재시도해도 결과가 똑같은
// 에러는 createPermanentFailure로 표시돼 있다 — outbox에서 제거하고 포기하며,
// 기사 upsert라면 낙관적으로 반영했던 로컬 값도 원래대로 되돌린다(outboxRollback.js).
/** @typedef {import('./outboxTypes.js').OutboxOp} OutboxOp */
/** @typedef {import('./outboxTypes.js').SessionCapture} SessionCapture */
/** @typedef {import('./outboxTypes.js').CarRecord} CarRecord */
/** @typedef {import('./mutationOutbox.js').OutboxResultStatus} OutboxResultStatus */
import { KEYS, keyFor, readJson } from './cloudStorage.js'
import { assertSessionStillCurrent, captureSession, isSessionStillCurrent } from './cloudSession.js'
import { getPendingOps, OUTBOX_RESULT, removeOutboxOp } from './mutationOutbox.js'
import { reconcileDriverAfterUpsertAndRemoveOp, rollbackDriverUpsertAndRemoveOp } from './outboxRollback.js'
import { syncVehicles } from './syncVehiclesClients.js'
import {
  deleteClientFromSupabase,
  deleteDriverLinkOnSupabase,
  deleteVehicleFromSupabase,
  findOverlappingDriverLinkOnSupabase,
  findExistingDriverLinkInsert,
  updateDriverLinkStatusOnSupabase,
  upsertDriverLinkOnSupabase,
} from './directMutations.js'
import { PermanentFailureError, StaleSessionError } from './outboxErrors.js'

/** @type {Map<string, { runningPromise: Promise<Map<string, { status: OutboxResultStatus, message?: string }>>|null, dirty: boolean }>} */
const outboxQueues = new Map()

/**
 * @param {OutboxOp} op
 * @param {SessionCapture} captured
 */
async function executeDriverUpsertOp(op, captured) {
  // 방금 등록한 차량이 아직 서버에 안 올라가 있을 수 있다 — 원래 saveDriverInviteToCloud가
  // 하던 대로, 기사 배정을 실제로 시도하기 전에 차량부터 먼저 반영해 supabaseId를 확보한다.
  await syncVehicles(op.userId, op.ownerKey)
  assertSessionStillCurrent(captured)
  const cars = /** @type {Array<CarRecord>} */ (readJson(keyFor(KEYS.cars, op.ownerKey), []))
  const car = cars.find((item) => item.number === op.payload.vehicleNumber)
  if (!car?.supabaseId) throw new Error('선택한 차량이 아직 클라우드에 동기화되지 않았습니다.')

  if (!op.payload.supabaseId) {
    // 사용자 지시 8번: 재시도 전에 "이미 내가 성공시켰을 수도 있는" 동일한 삽입이
    // 있는지 먼저 확인한다 — 있으면 겹침 검사/삽입 없이 그 행을 그대로 쓴다.
    const ownPrior = await findExistingDriverLinkInsert(car.supabaseId, op.payload.startDate ?? '', op.payload.inviteCode ?? '')
    assertSessionStillCurrent(captured)
    if (ownPrior) return ownPrior
  }

  const conflict = await findOverlappingDriverLinkOnSupabase(car.supabaseId, op.payload.startDate ?? '', op.payload.endDate ?? '', op.payload.supabaseId)
  assertSessionStillCurrent(captured)
  if (conflict) {
    throw new PermanentFailureError('같은 차량에 이미 겹치는 기간으로 연결되어 있거나 초대된 기록이 있습니다.')
  }

  return upsertDriverLinkOnSupabase({
    supabaseId: op.payload.supabaseId || null,
    vehicleId: car.supabaseId,
    inviteCode: op.payload.inviteCode ?? '',
    assignmentStart: op.payload.startDate ?? '',
    assignmentEnd: op.payload.endDate,
  }, captured)
}

/**
 * @param {OutboxOp} op
 * @param {SessionCapture} captured
 * @returns {Promise<{ handled: boolean }>} handled:true면 실행기가 이미 outbox 제거까지
 * 스스로 원자적으로 끝냈다는 뜻 — flushOnce가 또 제거하면 안 된다.
 */
async function executeOp(op, captured) {
  if (op.resourceType === 'vehicle' && op.operation === 'delete') {
    await deleteVehicleFromSupabase(op.resourceId, captured)
    return { handled: false }
  }
  if (op.resourceType === 'client' && op.operation === 'delete') {
    await deleteClientFromSupabase(op.resourceId, captured)
    return { handled: false }
  }
  if (op.resourceType === 'driverLink' && op.operation === 'delete') {
    await deleteDriverLinkOnSupabase(op.payload.supabaseId, captured)
    return { handled: false }
  }
  if (op.resourceType === 'driverLink' && op.operation === 'updateStatus') {
    await updateDriverLinkStatusOnSupabase(op.payload.supabaseId, op.payload.status ?? 'pending', captured)
    return { handled: false }
  }
  if (op.resourceType === 'driverLink' && op.operation === 'upsert') {
    const savedRow = await executeDriverUpsertOp(op, captured)
    // 원격 호출이 끝난 직후, 로컬에 반영하기 *전에* 세션이 여전히 유효한지 다시
    // 확인한다 — assertSessionStillCurrent가 stale이면 던지므로 아래 catch에서
    // 통일된 방식(OUTBOX_RESULT.STALE_SESSION)으로 처리된다.
    assertSessionStillCurrent(captured)
    reconcileDriverAfterUpsertAndRemoveOp(op, savedRow)
    return { handled: true }
  }
  throw new Error(`알 수 없는 outbox 작업: ${op.resourceType}/${op.operation}`)
}

/**
 * @param {string} ownerKey
 * @returns {Promise<Map<string, { status: OutboxResultStatus, message?: string }>>} opId →
 *   결과. message는 permanentFailure/retryable일 때만 채워진다(실제 실패 사유를
 *   호출부 토스트에 그대로 반영할 수 있게).
 */
async function flushOnce(ownerKey) {
  /** @type {Map<string, { status: OutboxResultStatus, message?: string }>} */
  const results = new Map()
  const captured = captureSession()
  if (captured.ownerKey !== ownerKey || !isSessionStillCurrent(captured)) return results
  const ops = getPendingOps(ownerKey)
  for (const op of ops) {
    if (!isSessionStillCurrent(captured)) { results.set(op.id, { status: OUTBOX_RESULT.STALE_SESSION }); return results }
    try {
      const { handled } = await executeOp(op, captured)
      if (!handled) removeOutboxOp(ownerKey, op.id)
      results.set(op.id, { status: OUTBOX_RESULT.SUCCESS })
    } catch (error) {
      if (error instanceof StaleSessionError) {
        // 현재 op은 그대로 보존한다(로컬 반영/제거 전부 건너뛴다) — 남은 op들도
        // 같은 이유로 실행하면 안 되므로 루프를 여기서 멈춘다.
        results.set(op.id, { status: OUTBOX_RESULT.STALE_SESSION })
        return results
      }
      if (error instanceof PermanentFailureError) {
        // 사용자 지시 3번: 확정 validation 실패는 재시도 대상이 아니다 — 제거하고
        // 포기한다. 기사 upsert라면 낙관적으로 반영했던 로컬 값도 되돌린다(1번).
        if (op.resourceType === 'driverLink' && op.operation === 'upsert') {
          rollbackDriverUpsertAndRemoveOp(op)
        } else {
          removeOutboxOp(ownerKey, op.id)
        }
        console.error(`[outboxFlush] ${op.resourceType} ${op.operation} 확정 실패(재시도 안 함), outbox에서 제거·롤백:`, error)
        results.set(op.id, { status: OUTBOX_RESULT.PERMANENT_FAILURE, message: error.message })
        continue
      }
      // 콘솔 출력만 하고 끝내지 않는다 — op을 outbox에 그대로 남겨 다음 flush(hydrate
      // 성공/재시도/재접속)가 이어서 시도하게 한다.
      console.error(`[outboxFlush] ${op.resourceType} ${op.operation} 재시도 실패, outbox에 남깁니다:`, error)
      results.set(op.id, { status: OUTBOX_RESULT.RETRYABLE, message: error instanceof Error ? error.message : String(error) })
    }
  }
  return results
}

/**
 * @param {string} ownerKey
 * @returns {Promise<Map<string, { status: OutboxResultStatus, message?: string }>>} 이번
 *   호출(들)에서 처리된 op들의 opId → 결과. 이미 실행 중이었다면(dirty 재실행)
 *   그 뒤에 이어 도는 회차까지 합쳐 돌려준다 — 새로 추가한 op이 durable하게 이미
 *   outbox에 쓰인 뒤라면, 실행 중이던 루프가 dirty로 인해 한 번 더 돌 때 반드시
 *   포함되므로 호출부가 자신이 넣은 op.id로 찾아보면 된다.
 */
export function flushMutationOutbox(ownerKey) {
  let state = outboxQueues.get(ownerKey)
  if (!state) {
    state = { runningPromise: null, dirty: false }
    outboxQueues.set(ownerKey, state)
  }
  if (state.runningPromise) {
    state.dirty = true
    return state.runningPromise
  }
  const currentState = state
  currentState.runningPromise = (async () => {
    try {
      /** @type {Map<string, { status: OutboxResultStatus, message?: string }>} */
      const merged = new Map()
      do {
        currentState.dirty = false
        const round = await flushOnce(ownerKey)
        round.forEach((entry, opId) => merged.set(opId, entry))
      } while (currentState.dirty)
      return merged
    } finally {
      currentState.runningPromise = null
    }
  })()
  return currentState.runningPromise
}

/** 테스트 전용: outbox 큐 상태를 초기화한다. */
export function resetOutboxQueuesForTests() {
  outboxQueues.clear()
}
