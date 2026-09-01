// @ts-check
// Step 6 재감사 2차 — pending 큐 재시도 리스너. 재감사 11차: 큐가 있을 때만
// interval을 켜고, 비면 즉시 끈다(상시 5초 타이머는 테스트 프로세스를 안 죽인다).
// 재감사 16차: unsafe는 invalid patch라 자동 retry로 복구되지 않는다. 타이머는
// durable/fallback pending이 있을 때만 켠다. beforeunload 방어는 unsafe만 있어도 유지.
import { hasPendingDayWrites, retryPendingDayWrites } from '../lib/pendingWorkDataWrites.js'
import { guardBeforeUnload } from '../lib/durableWriteGuard.js'
import { setPendingRetryPulse } from '../lib/pendingRetryPulse.js'
import { getCloudOwnerKey } from '../lib/cloudSession.js'
import { shouldCommitDayLogToCloud } from '../lib/mainDayLogRouting.js'

const RETRY_INTERVAL_MS = 5000

/**
 * @typedef {Object} EventTargetLike
 * @property {(type: string, listener: (event: Event) => void) => void} addEventListener
 * @property {(type: string, listener: (event: Event) => void) => void} removeEventListener
 */

/**
 * @param {EventTargetLike} windowTarget
 * @returns {() => void} cleanup
 */
export function attachPendingWriteRetryListeners(windowTarget) {
  /** @type {ReturnType<typeof setInterval>|null} */
  let timer = null

  function disarm() {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  function arm() {
    if (timer || !hasPendingDayWrites()) return
    timer = setInterval(runRetry, RETRY_INTERVAL_MS)
  }

  // 슬라이스 D: 로그인 + 서버에 있는 메인 차량이면 그 일지는 Fail-Fast(재시도 큐 없음)다.
  // 옛 durable 큐를 재시도해 서버 정본으로 맞춰진 Store를 덮지 않는다. 게스트·미동기화
  // 메인 차량의 큐는 그대로 재시도한다(서버가 없으니 로컬 복구가 유일한 방법).
  function retryDisabled() {
    const ownerKey = getCloudOwnerKey()
    return !!ownerKey && shouldCommitDayLogToCloud(ownerKey, 'main')
  }

  function syncTimer() {
    if (!retryDisabled() && hasPendingDayWrites()) arm()
    else disarm()
  }

  function runRetry() {
    if (retryDisabled()) { disarm(); return }
    if (hasPendingDayWrites()) retryPendingDayWrites()
    syncTimer()
  }

  runRetry()
  windowTarget.addEventListener('online', runRetry)
  windowTarget.addEventListener('beforeunload', guardBeforeUnload)
  setPendingRetryPulse(syncTimer)
  return () => {
    setPendingRetryPulse(() => {})
    windowTarget.removeEventListener('online', runRetry)
    windowTarget.removeEventListener('beforeunload', guardBeforeUnload)
    disarm()
  }
}
