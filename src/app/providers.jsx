// @ts-check
// 앱 루트 전용 리스너 모음. App.jsx가 한 번만 마운트한다.
import { useEffect } from 'react'
import { attachSyncFlushListeners } from './syncFlushListeners.js'
import { attachPendingWriteRetryListeners } from './pendingWriteRetryListeners.js'

/**
 * online / visibilitychange(hidden) / pagehide 시 클라우드 동기화를 즉시 flush한다.
 * 모바일에서 setTimeout 디바운스가 백그라운드 전환 중 죽어 저장이 클라우드에 반영되지
 * 않는 것을 막는다.
 * flushCloudSync 자체는 hydrate 전/게스트/로그아웃 상태에서 no-op이라 항상 마운트해도 된다.
 * @returns {null}
 */
export function SyncFlushBridge() {
  useEffect(() => attachSyncFlushListeners(window, document), [])

  return null
}

/**
 * quota 초과 등으로 실패한 일지 자동 저장을
 * pendingWorkDataWrites.js 큐에서 컴포넌트 생애주기와 무관하게 계속 재시도한다.
 * 큐가 비어 있으면 재시도 자체가 아무 일도 안 하므로 항상 마운트해도 된다.
 * @returns {null}
 */
export function PendingWriteRetryBridge() {
  useEffect(() => attachPendingWriteRetryListeners(window), [])

  return null
}

/**
 * body.account-flow-active 클래스 토글 전담 브리지. App.jsx가 document.body를 직접
 * 만지지 않도록 격리한다 — InlineExpandHost류 raw DOM 조작 패턴이 새 코드에 다시
 * 생기지 않게 하기 위함.
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
