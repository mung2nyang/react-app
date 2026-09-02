// @ts-check
// 슬라이스 E: 로그인 업무 저장은 각 창구가 서버 직접 1회다. 이 큐는 mutation
// outbox(삭제 등 기존 op)만 디바운스/즉시 플러시한다. LS 스냅샷 syncAll은 쓰지 않는다.
import { getCloudOwnerKey, getCloudUserId, isHydrationReady } from './cloudSession.js'
import { flushMutationOutbox } from './outboxFlush.js'

/** @type {ReturnType<typeof setTimeout>|null} */
let syncTimer = null

export function scheduleCloudSync() {
  const userId = getCloudUserId()
  const ownerKey = getCloudOwnerKey()
  if (!isHydrationReady() || !userId || !ownerKey) return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    flushMutationOutbox(ownerKey).catch((/** @type {Error} */ error) => console.error('outbox 플러시 실패:', error))
  }, 600)
}

/**
 * pagehide/visibilitychange/online에서 부른다. mutation outbox만 즉시 플러시한다.
 */
export async function flushCloudSync() {
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null }
  const userId = getCloudUserId()
  const ownerKey = getCloudOwnerKey()
  if (!isHydrationReady() || !userId || !ownerKey) return
  await flushMutationOutbox(ownerKey)
}
