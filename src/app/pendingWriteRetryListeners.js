// @ts-check
// Step 6 재감사 2차(FAIL 지적) — lib/pendingWorkDataWrites.js의 큐를 실제로
// 재시도시키는 리스너. syncFlushListeners.js와 같은 이유로 순수 함수로 뺐다(React
// 없이 등록/해제 짝이 맞는지 테스트하기 위해).
// 재감사 3차(FAIL 지적 2번) — (1) 큐가 이제 durable(localStorage)이므로, 이 함수가
// 붙는 순간(부팅/하드 새로고침 직후 포함) 5초를 기다리지 않고 즉시 한 번 재시도해
// 복구한다. (2) durable 기록 자체가 막혀 있으면(durableWriteGuard.js) 탭을
// 닫거나 새로고침할 때 네이티브 확인창으로 조용한 유실을 막는다.
import { hasPendingDayWrites, retryPendingDayWrites } from '../lib/pendingWorkDataWrites.js'
import { guardBeforeUnload } from '../lib/durableWriteGuard.js'

const RETRY_INTERVAL_MS = 5000

/**
 * @typedef {Object} EventTargetLike
 * @property {(type: string, listener: (event: Event) => void) => void} addEventListener
 * @property {(type: string, listener: (event: Event) => void) => void} removeEventListener
 */

/**
 * online 이벤트와 주기적 타이머(5초, 큐가 비어 있으면 아무 일도 안 한다)로
 * 재시도한다. beforeunload에는 durable 기록이 막혀 있을 때만 경고를 띄운다.
 * cleanup 함수를 돌려준다.
 * @param {EventTargetLike} windowTarget
 * @returns {() => void} cleanup
 */
export function attachPendingWriteRetryListeners(windowTarget) {
  function retry() {
    if (hasPendingDayWrites()) retryPendingDayWrites()
  }
  // 하드 새로고침/탭 재시작 직후 이 함수가 처음 붙는 순간 즉시 한 번 시도한다 —
  // durable 저장소에서 그대로 복구되므로 온라인 이벤트나 5초 타이머를 기다릴 필요가
  // 없다("reload 후 재시도" 요구사항).
  retry()
  windowTarget.addEventListener('online', retry)
  windowTarget.addEventListener('beforeunload', guardBeforeUnload)
  const timer = setInterval(retry, RETRY_INTERVAL_MS)
  return () => {
    windowTarget.removeEventListener('online', retry)
    windowTarget.removeEventListener('beforeunload', guardBeforeUnload)
    clearInterval(timer)
  }
}
