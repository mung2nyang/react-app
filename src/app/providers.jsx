// @ts-check
// 앱 루트 전용 리스너 모음. App.jsx가 한 번만 마운트한다.
import { useEffect } from 'react'
import { attachPendingWriteRetryListeners } from './pendingWriteRetryListeners.js'

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
