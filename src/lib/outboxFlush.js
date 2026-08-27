// Step 0-4 감사 보완 4차(+재작업): mutation outbox 실제 재시도 엔진. owner별
// running/dirty 큐(single-flight, 실행 중 새 op가 추가되면 한 번 더 돈 뒤에만
// resolve)로 flushMutationOutbox가 안전하게 여러 번 겹쳐 불려도 된다.
//
// 세션 재검증(사용자 지시 4번): flush 시작 시, 각 op 실행 *직전*, executeOp의
// await(원격 호출)가 끝난 *직후*(reconcile/outbox 제거로 이어지는 쓰기 전) — 이
// 세 지점 전부 isSessionStillCurrent()로 재확인한다. 하나라도 달라졌으면 그
// owner의 남은 작업/현재 작업의 로컬 반영을 전부 건너뛰고 조용히 멈춘다.
//
// 확정 실패(사용자 지시 3번): 기사 배정 기간 겹침처럼 재시도해도 결과가 똑같은
// 에러는 createPermanentFailure로 표시돼 있다 — 그런 에러는 outbox에서 제거하고
// 포기한다(영원히 재시도하지 않는다). 그 외 에러(네트워크 등 일시적)는 그대로 남겨
// 다음 flush가 잇는다.
import { KEYS, keyFor, readJson } from './cloudStorage.js'
import { captureSession, isSessionStillCurrent } from './cloudSession.js'
import { writeAllOrNothing } from '../store/atomicPersist.js'
import { commitBatch } from '../store/app-store.js'
import { createPermanentFailure, getPendingOps, outboxStorageKey, removeOutboxOp } from './mutationOutbox.js'
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

const outboxQueues = new Map()

async function executeDriverUpsertOp(op) {
  // 방금 등록한 차량이 아직 서버에 안 올라가 있을 수 있다 — 원래 saveDriverInviteToCloud가
  // 하던 대로, 기사 배정을 실제로 시도하기 전에 차량부터 먼저 반영해 supabaseId를 확보한다.
  await syncVehicles(op.userId, op.ownerKey)
  const cars = readJson(keyFor(KEYS.cars, op.ownerKey), [])
  const car = cars.find((item) => item.number === op.payload.vehicleNumber)
  if (!car?.supabaseId) throw new Error('선택한 차량이 아직 클라우드에 동기화되지 않았습니다.')

  if (!op.payload.supabaseId) {
    // 사용자 지시 8번: 재시도 전에 "이미 내가 성공시켰을 수도 있는" 동일한 삽입이
    // 있는지 먼저 확인한다 — 있으면 겹침 검사/삽입 없이 그 행을 그대로 쓴다. 응답
    // 유실로 인한 재시도가 겹침 오탐으로 영구히 막히지 않게 하는 진짜 멱등성이다.
    const ownPrior = await findExistingDriverLinkInsert(car.supabaseId, op.payload.startDate, op.payload.inviteCode)
    if (ownPrior) return ownPrior
  }

  const conflict = await findOverlappingDriverLinkOnSupabase(car.supabaseId, op.payload.startDate, op.payload.endDate, op.payload.supabaseId)
  if (conflict) throw createPermanentFailure('같은 차량에 이미 겹치는 기간으로 연결되어 있거나 초대된 기록이 있습니다.')

  return upsertDriverLinkOnSupabase({
    supabaseId: op.payload.supabaseId || null,
    vehicleId: car.supabaseId,
    inviteCode: op.payload.inviteCode,
    assignmentStart: op.payload.startDate,
    assignmentEnd: op.payload.endDate,
  })
}

/**
 * upsert 성공 후 로컬 drivers 배열에 서버가 확정한 supabaseId/inviteCode 등을
 * 되반영하고, 그 쓰기와 outbox 제거를 하나의 원자적 쓰기로 묶는다(사용자 지시 5번).
 * localStorage뿐 아니라 Store(app-store.js) 상태도 갱신한다 — 이전엔 localStorage만
 * 갱신하고 outbox 제거는 별도 호출이라, 둘 사이에 실패하면 "로컬은 갱신됐는데
 * outbox엔 아직 남아 있어 또 실행되는"(또는 그 반대) 불일치가 생길 수 있었다.
 */
function reconcileDriverAfterUpsertAndRemoveOp(op, savedRow) {
  const { ownerKey } = op
  const drivers = readJson(keyFor(KEYS.drivers, ownerKey), [])
  const nextDrivers = drivers.map((driver) => (driver.id === op.resourceId ? {
    ...driver,
    supabaseId: savedRow.id,
    inviteCode: savedRow.invite_code,
    startDate: savedRow.assignment_start || driver.startDate,
    endDate: savedRow.assignment_end || driver.endDate || '',
    status: savedRow.status === 'linked' ? 'linked' : driver.status,
  } : driver))
  const remainingOps = getPendingOps(ownerKey).filter((pending) => pending.id !== op.id)

  writeAllOrNothing([
    { key: keyFor(KEYS.drivers, ownerKey), value: nextDrivers },
    { key: outboxStorageKey(ownerKey), value: remainingOps },
  ])
  commitBatch([{ domain: 'drivers', ownerKey, value: nextDrivers }], { persist: false, syncToCloud: false })
}

/**
 * @returns {Promise<{ handled: boolean }>} handled:true면 실행기가 이미 outbox 제거까지
 * 스스로 원자적으로 끝냈다는 뜻 — flushOnce가 또 제거하면 안 된다.
 */
async function executeOp(op, captured) {
  if (op.resourceType === 'vehicle' && op.operation === 'delete') {
    await deleteVehicleFromSupabase(op.resourceId)
    return { handled: false }
  }
  if (op.resourceType === 'client' && op.operation === 'delete') {
    await deleteClientFromSupabase(op.resourceId)
    return { handled: false }
  }
  if (op.resourceType === 'driverLink' && op.operation === 'delete') {
    await deleteDriverLinkOnSupabase(op.payload.supabaseId)
    return { handled: false }
  }
  if (op.resourceType === 'driverLink' && op.operation === 'updateStatus') {
    await updateDriverLinkStatusOnSupabase(op.payload.supabaseId, op.payload.status)
    return { handled: false }
  }
  if (op.resourceType === 'driverLink' && op.operation === 'upsert') {
    const savedRow = await executeDriverUpsertOp(op)
    // 사용자 지시 4번: 원격 호출(await)이 끝난 직후, 로컬에 반영하기 *전에* 세션이
    // 여전히 유효한지 다시 확인한다 — 그 사이 로그아웃/owner 전환이 있었다면 이
    // 결과를 로컬에 쓰지 않는다(outbox도 그대로 둔다 — 다음 owner가 신경 쓸 일이 아니다).
    if (!isSessionStillCurrent(captured)) return { handled: true }
    reconcileDriverAfterUpsertAndRemoveOp(op, savedRow)
    return { handled: true }
  }
  throw new Error(`알 수 없는 outbox 작업: ${op.resourceType}/${op.operation}`)
}

async function flushOnce(ownerKey) {
  const captured = captureSession()
  if (captured.ownerKey !== ownerKey || !isSessionStillCurrent(captured)) return
  const ops = getPendingOps(ownerKey)
  for (const op of ops) {
    if (!isSessionStillCurrent(captured)) return // 세션이 바뀌었다 — 남은 op는 그대로 두고 멈춘다.
    try {
      const { handled } = await executeOp(op, captured)
      // 사용자 지시 4번: outbox 제거 직전에도 다시 확인한다.
      if (!handled && isSessionStillCurrent(captured)) removeOutboxOp(ownerKey, op.id)
    } catch (error) {
      if (error.permanent) {
        // 사용자 지시 3번: 확정 validation 실패는 재시도 대상이 아니다 — 제거하고 포기한다.
        if (isSessionStillCurrent(captured)) removeOutboxOp(ownerKey, op.id)
        console.error(`[outboxFlush] ${op.resourceType} ${op.operation} 확정 실패(재시도 안 함), outbox에서 제거:`, error)
        continue
      }
      // 콘솔 출력만 하고 끝내지 않는다 — op을 outbox에 그대로 남겨 다음 flush(hydrate
      // 성공/재시도/재접속)가 이어서 시도하게 한다.
      console.error(`[outboxFlush] ${op.resourceType} ${op.operation} 재시도 실패, outbox에 남깁니다:`, error)
    }
  }
}

/**
 * @param {string} ownerKey
 * @returns {Promise<void>}
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
  state.runningPromise = (async () => {
    try {
      do {
        state.dirty = false
        await flushOnce(ownerKey)
      } while (state.dirty)
    } finally {
      state.runningPromise = null
    }
  })()
  return state.runningPromise
}

/** 테스트 전용: outbox 큐 상태를 초기화한다. */
export function resetOutboxQueuesForTests() {
  outboxQueues.clear()
}
