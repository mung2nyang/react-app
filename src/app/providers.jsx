// Step 2: 앱 루트 전용 리스너를 한 곳에 모은다 (migration-plan.md 3.11 "전역 리스너: 루트
// 한 곳 + cleanup"). App.jsx가 화면과 무관하게 딱 한 번만 마운트한다.
import { useEffect } from 'react'
import { flushCloudSync } from '../lib/cloudSync.js'

/**
 * online / visibilitychange(hidden) / pagehide 시 클라우드 동기화를 즉시 flush한다.
 * 모바일에서 setTimeout 디바운스가 백그라운드 전환 중 죽어 저장이 클라우드에 반영되지
 * 않던 문제를 막기 위한 것 — 바닐라 script.js와 같은 계기(migration-research.md 3.4).
 * flushCloudSync 자체는 hydrate 전/게스트/로그아웃 상태에서 no-op이라 항상 마운트해도 된다.
 * @returns {null}
 */
export function SyncFlushBridge() {
  useEffect(() => {
    function flush() {
      flushCloudSync().catch((error) => console.error('[SyncFlushBridge] flush 실패:', error))
    }
    function onVisibilityChange() {
      if (document.hidden) flush()
    }
    window.addEventListener('online', flush)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  return null
}
