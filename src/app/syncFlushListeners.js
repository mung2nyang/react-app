// Step 0-4 감사 보완: SyncFlushBridge(providers.jsx)의 리스너 등록/정리를 순수 함수로
// 뺐다 — React 없이도 "등록한 것과 정리하는 것이 실제로 짝이 맞는지"(StrictMode 마운트→
// 언마운트→재마운트에서 리스너가 누적되지 않는지)를 테스트할 수 있다. 컴포넌트와 같은
// 파일에 두면 Fast Refresh 경계가 깨져서(oxlint react(only-export-components)) 분리했다.
import { flushCloudSync } from '../lib/cloudSync.js'

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
