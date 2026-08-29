// @ts-check
// 재감사 12차 — 백그라운드 pending 재시도가 성공해도 useDayDraft가 hasPendingRef/
// autoSaveStatus를 정리하지 않으면, 이후 언마운트 flush가 commitNow를 한 번 더 돌려
// store/notify/클라우드가 중복된다. 재감사 13차 — 그 정리를 "성공이면 무조건" 하면
// 더 최신 draft(B)가 있는 동안 과거 patch(A)의 콜백이 pending을 내려 B가 유실된다.
import { useEffect, useRef } from 'react'
import { clearUnsafeRegistrationFailure, markUnsafeRegistrationFailure } from '../../lib/durableWriteGuard.js'
import { registerPendingDayWrite } from '../../lib/pendingWorkDataWrites.js'

/** @typedef {import('../../lib/pendingWorkDataWritesTypes.js').EffectivePatch} EffectivePatch */

export function useMountedRef() {
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])
  return mountedRef
}

/**
 * @param {string} ownerKey
 * @param {string} dateKey
 * @param {EffectivePatch} patch
 * @param {(ok: boolean) => void} onSettled
 */
export function queueFailedDayWrite(ownerKey, dateKey, patch, onSettled) {
  const registered = registerPendingDayWrite(ownerKey, dateKey, patch, onSettled)
  if (registered) clearUnsafeRegistrationFailure(ownerKey, dateKey)
  else markUnsafeRegistrationFailure(ownerKey, dateKey, patch)
}

/**
 * @param {{ current: boolean }} hasPendingRef
 * @param {{ current: boolean }} mountedRef
 * @param {(status: 'idle'|'pending'|'saved'|'failed') => void} setAutoSaveStatus
 * @param {{ current: (() => void)|undefined }} onCommittedRef
 * @param {{ current: number }} draftRevRef
 * @param {number} attemptRev 이 콜백이 붙을 때 캡처한 draft/commit revision
 * @param {boolean} ok
 */
export function settlePendingDayWrite(hasPendingRef, mountedRef, setAutoSaveStatus, onCommittedRef, draftRevRef, attemptRev, ok) {
  if (!ok) return
  onCommittedRef.current?.()
  if (attemptRev !== draftRevRef.current) return
  hasPendingRef.current = false
  if (mountedRef.current) setAutoSaveStatus('saved')
}
