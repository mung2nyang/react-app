// SyncFlushBridge(providers.jsx)의 리스너 등록·정리 순수 함수 — 등록·정리 짝이 맞는지 React 없이 테스트한다.
import { flushCloudSync } from '../lib/syncQueue.js'

/**
 * online / visibilitychange(hidden) / pagehide 리스너를 등록하고, 그 3개를 정확히
 * 제거하는 cleanup 함수를 돌려준다.
 * @param {{ addEventListener: Function, removeEventListener: Function }} windowTarget
 * @param {{ addEventListener: Function, removeEventListener: Function, hidden?: boolean }} documentTarget
 * @returns {() => void} cleanup
 */
export function attachSyncFlushListeners(windowTarget, documentTarget) {
  function flush() {
    flushCloudSync().catch((error) => console.error('[SyncFlushBridge] flush 실패:', error))
  }
  function onVisibilityChange() {
    if (documentTarget.hidden) flush()
  }
  windowTarget.addEventListener('online', flush)
  documentTarget.addEventListener('visibilitychange', onVisibilityChange)
  windowTarget.addEventListener('pagehide', flush)
  return () => {
    windowTarget.removeEventListener('online', flush)
    documentTarget.removeEventListener('visibilitychange', onVisibilityChange)
    windowTarget.removeEventListener('pagehide', flush)
  }
}
