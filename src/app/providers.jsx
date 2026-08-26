// Step 2: 앱 루트 전용 리스너를 한 곳에 모은다 (migration-plan.md 3.11 "전역 리스너: 루트
// 한 곳 + cleanup"). App.jsx가 화면과 무관하게 딱 한 번만 마운트한다.
import { useEffect } from 'react'
import { attachSyncFlushListeners } from './syncFlushListeners.js'

/**
 * online / visibilitychange(hidden) / pagehide 시 클라우드 동기화를 즉시 flush한다.
 * 모바일에서 setTimeout 디바운스가 백그라운드 전환 중 죽어 저장이 클라우드에 반영되지
 * 않던 문제를 막기 위한 것 — 바닐라 script.js와 같은 계기(migration-research.md 3.4).
 * flushCloudSync 자체는 hydrate 전/게스트/로그아웃 상태에서 no-op이라 항상 마운트해도 된다.
 * @returns {null}
 */
export function SyncFlushBridge() {
  useEffect(() => attachSyncFlushListeners(window, document), [])

  return null
}

/**
 * body.account-flow-active 클래스 토글 전담 브리지. App.jsx가 document.body를 직접
 * 만지지 않도록 격리한다 — InlineExpandHost류 raw DOM 조작 패턴이 새 코드에 다시
 * 생기지 않게 하기 위함(Step 0-4 감사 보완).
 * @param {{ active: boolean }} props
 * @returns {null}
 */
export function AccountFlowBodyClass({ active }) {
  useEffect(() => {
    document.body.classList.toggle('account-flow-active', active)
    return () => document.body.classList.remove('account-flow-active')
  }, [active])

  return null
}
