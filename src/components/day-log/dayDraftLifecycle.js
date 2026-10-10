// @ts-check
// 백그라운드 재시도가 성공하면 pending 표시를 내려야 언마운트 때 중복 저장이 안 된다.
// 단 더 최신 draft(B)가 있으면 옛 patch(A) 성공으로 내리지 않는다 — 내리면 B가 유실된다.
import { useEffect, useRef } from 'react'
import { clearUnsafeRegistrationFailure, markUnsafeRegistrationFailure } from '../../lib/durableWriteGuard.js'
import { registerPendingDayWrite } from '../../lib/pendingWorkDataWrites.js'

/** @typedef {import('../../lib/pendingWorkDataWritesTypes.js').EffectivePatch} EffectivePatch */

export function useMountedRef() {
  const mountedRef = useRef(true)
  // StrictMode(개발)의 켜기→끄기→다시 켜기에서도 다시 켜지면 열림으로 되돌린다.
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])
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
