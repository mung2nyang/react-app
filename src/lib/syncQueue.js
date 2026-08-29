// @ts-check
// Step 0-4 감사 보완 4차: cloudSync.js 분리 조각 — "로컬 전체 스냅샷을 서버에 반영"
// 하는 일반 동기화 큐(디바운스 600ms). 개별 삭제/기사 mutation의 durable 재시도는
// outboxFlush.js가 별도로 맡는다 — flushCloudSync/성공한 hydrate 둘 다 두 큐를 같이
// 건드린다(사용자 지시: pagehide/재접속에서도 outbox가 자동 재시도돼야 한다).
/** @typedef {import('./outboxTypes.js').SessionCapture} SessionCapture */
import { supabase } from '../supabaseClient.js'
import { practiceSnapshotForProfile, collectPracticeSnapshot } from './cloudStorage.js'
import { assertSessionStillCurrent, captureSession, getCloudOwnerKey, getCloudUserId, isHydrationReady, isSessionStillCurrent } from './cloudSession.js'
import { clearDirty } from './dirtyJournal.js'
import { flushMutationOutbox } from './outboxFlush.js'
import { StaleSessionError } from './outboxErrors.js'
import { syncClients, syncVehicles } from './syncVehiclesClients.js'
import { syncWorkData } from './syncWorkData.js'
import { syncDeletedWorkDates } from './syncDeletedWorkDates.js'
import { syncFuelRecords, syncMaintenanceRecords, syncMiscExpenseRecords } from './syncExpenseRecords.js'
import { syncTaxInvoices } from './syncTaxInvoicesTable.js'

/** @type {ReturnType<typeof setTimeout>|null} */
let syncTimer = null
// Step 0-4 감사 보완: syncing boolean 하나로는 "지금 도는 동기화가 끝나면 한 번 더 돌아야
// 하는지"를 표현할 수 없었다 — runningPromise + dirty로 flushCloudSync가 "지금 도는
// 것"과 "그 사이 생긴 추가 변경"을 전부 기다린 뒤에만 resolve하게 한다.
/** @type {{ runningPromise: Promise<void>|null, dirty: boolean }} */
const syncQueue = { runningPromise: null, dirty: false }

// 4차 재작업(사용자 지시 3번): profile upsert부터 각 도메인 sync까지, 모든 원격
// await 직후 세션을 재확인한다 — 그 사이 로그아웃/owner 전환이 있었으면
// assertSessionStillCurrent가 `.staleSession` 에러를 던져 남은 단계(vehicles 이하)를
// 아예 실행하지 않는다. 로그아웃 후 다음 Supabase 호출이 0회여야 한다는 요구사항은
// 이 함수 안의 매 단계 경계에서 지켜진다.
/**
 * @param {string} userId
 * @param {string} ownerKey
 * @param {SessionCapture} captured
 */
async function syncAll(userId, ownerKey, captured) {
  const snapshot = collectPracticeSnapshot(ownerKey)
  const profile = snapshot.profile || {}
  const settings = snapshot.settings || {}
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    name: profile.name || null,
    phone: profile.phone || null,
    business_name: profile.bizName || null,
    business_number: profile.bizNumber || null,
    business_address: profile.bizAddress || null,
    business_type: profile.bizType || null,
    business_item: profile.bizItem || null,
    business_email: profile.bizEmail || null,
    bank_name: profile.bankName || null,
    account_number: profile.accountNumber || null,
    settings: { ...settings, practiceSnapshot: practiceSnapshotForProfile(snapshot) },
    updated_at: new Date().toISOString(),
  })
  assertSessionStillCurrent(captured)
  if (profileError) throw profileError

  const cars = await syncVehicles(userId, ownerKey)
  assertSessionStillCurrent(captured)
  const clients = await syncClients(userId, ownerKey)
  assertSessionStillCurrent(captured)
  await syncWorkData(userId, ownerKey, cars, clients)
  assertSessionStillCurrent(captured)
  // 재감사 3차(FAIL 지적 1번) — syncWorkData는 로컬에 남은 날짜만 upsert한다. 빈 날
  // 삭제로 생긴 tombstone(있으면)을 여기서 실제로 원격 삭제까지 반영한다. 이 단계가
  // 던지면(삭제 실패/transport 삭제 실패/세션 전환) syncAll 전체가 실패해 아래
  // clearDirty가 안 불리고 workData/workDataDeletedDates가 dirty로 남는다 — 다음
  // hydrate가 그 dirty 상태를 보고 서버 값으로 워크데이터를 덮지 않는다.
  await syncDeletedWorkDates(userId, ownerKey, cars, captured)
  assertSessionStillCurrent(captured)
  await syncFuelRecords(userId, ownerKey, cars)
  assertSessionStillCurrent(captured)
  await syncMaintenanceRecords(userId, ownerKey, cars)
  assertSessionStillCurrent(captured)
  await syncMiscExpenseRecords(userId, ownerKey, cars)
  assertSessionStillCurrent(captured)
  await syncTaxInvoices(userId, ownerKey, cars, clients)
  assertSessionStillCurrent(captured)
}

// 사용자 지시 7번(4차 재작업 3번): 일반 동기화 큐도 outbox처럼 세션(epoch)으로
// 로그아웃/owner 전환을 방어한다. 시작 시 세션을 캡처해 두고, 각 syncAll 재실행
// *전*과 clearDirty *직전*에 재검증한다 — 그 사이 로그아웃/다른 owner로 전환됐으면
// 이 owner의 dirty journal을 "성공적으로 비웠다"고 잘못 표시하지 않는다(다음
// 재로그인이 다시 정확히 판단하게 둔다). staleSession은 실패가 아니라 예상된
// 중단이라 조용히 멈추고(dirty 유지), 다른 에러만 위로 던져 기존 실패 로깅을 탄다.
/**
 * @param {string} userId
 * @param {string} ownerKey
 * @returns {Promise<void>}
 */
function queueSync(userId, ownerKey) {
  if (syncQueue.runningPromise) {
    syncQueue.dirty = true
    return syncQueue.runningPromise
  }
  const captured = captureSession()
  syncQueue.runningPromise = (async () => {
    try {
      do {
        if (!isSessionStillCurrent(captured)) return
        syncQueue.dirty = false
        try {
          await syncAll(userId, ownerKey, captured)
        } catch (error) {
          if (error instanceof StaleSessionError) return
          throw error
        }
      } while (syncQueue.dirty)
      if (isSessionStillCurrent(captured)) clearDirty(ownerKey)
    } finally {
      syncQueue.runningPromise = null
    }
  })()
  return syncQueue.runningPromise
}

export function scheduleCloudSync() {
  const userId = getCloudUserId()
  const ownerKey = getCloudOwnerKey()
  if (!isHydrationReady() || !userId || !ownerKey) return
  if (syncQueue.runningPromise) {
    syncQueue.dirty = true
    return
  }
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    // 재감사 3번: 이 두 함수가 던지는 건 항상 Error(우리 코드) 또는 PostgrestError
    // (Error를 상속함)뿐이다 — unknown 대신 실제로 던져지는 타입을 그대로 적는다.
    queueSync(userId, ownerKey).catch((/** @type {Error} */ error) => console.error('클라우드 동기화 실패:', error))
    flushMutationOutbox(ownerKey).catch((/** @type {Error} */ error) => console.error('outbox 플러시 실패:', error))
  }, 600)
}

/**
 * pagehide/visibilitychange/online에서 부른다. 도메인 스냅샷 큐와 mutation outbox를
 * 둘 다 즉시(디바운스 없이) 플러시하고 끝날 때까지 기다린다.
 */
export async function flushCloudSync() {
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null }
  const userId = getCloudUserId()
  const ownerKey = getCloudOwnerKey()
  if (!isHydrationReady() || !userId || !ownerKey) return
  await Promise.all([queueSync(userId, ownerKey), flushMutationOutbox(ownerKey)])
}
