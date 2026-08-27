// Step 0-4 감사 보완 4차: cloudSync.js 분리 조각 — "로컬 전체 스냅샷을 서버에 반영"
// 하는 일반 동기화 큐(디바운스 600ms). 개별 삭제/기사 mutation의 durable 재시도는
// outboxFlush.js가 별도로 맡는다 — flushCloudSync/성공한 hydrate 둘 다 두 큐를 같이
// 건드린다(사용자 지시: pagehide/재접속에서도 outbox가 자동 재시도돼야 한다).
import { supabase } from '../supabaseClient.js'
import { practiceSnapshotForProfile, collectPracticeSnapshot } from './cloudStorage.js'
import { captureSession, getCloudOwnerKey, getCloudUserId, isHydrationReady, isSessionStillCurrent } from './cloudSession.js'
import { clearDirty } from './dirtyJournal.js'
import { flushMutationOutbox } from './outboxFlush.js'
import { syncClients, syncVehicles } from './syncVehiclesClients.js'
import { syncWorkData } from './syncWorkData.js'
import { syncFuelRecords, syncMaintenanceRecords, syncMiscExpenseRecords } from './syncExpenseRecords.js'
import { syncTaxInvoices } from './syncTaxInvoicesTable.js'

let syncTimer = null
// Step 0-4 감사 보완: syncing boolean 하나로는 "지금 도는 동기화가 끝나면 한 번 더 돌아야
// 하는지"를 표현할 수 없었다 — runningPromise + dirty로 flushCloudSync가 "지금 도는
// 것"과 "그 사이 생긴 추가 변경"을 전부 기다린 뒤에만 resolve하게 한다.
const syncQueue = { runningPromise: null, dirty: false }

async function syncAll(userId, ownerKey) {
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
  if (profileError) throw profileError

  const cars = await syncVehicles(userId, ownerKey)
  const clients = await syncClients(userId, ownerKey)
  await syncWorkData(userId, ownerKey, cars, clients)
  await syncFuelRecords(userId, ownerKey, cars)
  await syncMaintenanceRecords(userId, ownerKey, cars)
  await syncMiscExpenseRecords(userId, ownerKey, cars)
  await syncTaxInvoices(userId, ownerKey, cars, clients)
}

// 사용자 지시 7번: 일반 동기화 큐도 outbox처럼 세션(epoch)으로 로그아웃/owner 전환을
// 방어한다. 시작 시 세션을 캡처해 두고, 각 syncAll 재실행 *전*과 clearDirty *직전*에
// 재검증한다 — 그 사이 로그아웃/다른 owner로 전환됐으면 이 owner의 dirty journal을
// "성공적으로 비웠다"고 잘못 표시하지 않는다(다음 재로그인이 다시 정확히 판단하게 둔다).
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
        await syncAll(userId, ownerKey)
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
    queueSync(userId, ownerKey).catch((error) => console.error('클라우드 동기화 실패:', error))
    flushMutationOutbox(ownerKey).catch((error) => console.error('outbox 플러시 실패:', error))
  }, 600)
}

/**
 * pagehide/visibilitychange/online에서 부른다. 도메인 스냅샷 큐와 mutation outbox를
 * 둘 다 즉시(디바운스 없이) 플러시하고 끝날 때까지 기다린다.
 */
export async function flushCloudSync() {
  const userId = getCloudUserId()
  const ownerKey = getCloudOwnerKey()
  if (!isHydrationReady() || !userId || !ownerKey) return
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null }
  await Promise.all([queueSync(userId, ownerKey), flushMutationOutbox(ownerKey)])
}
