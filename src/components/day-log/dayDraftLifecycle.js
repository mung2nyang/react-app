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
 * 로그인 서버 저장 결과 처리. 저장 시작 때 판 번호가 지금과 같을 때만 "저장 대기"를 내린다(뒤에 고친 내용은 다음 저장이 맡음).
 * @param {{ cloud: true, ok: boolean, toast: string|null }} result
 * @param {{ attemptRev: number, draftRevRef: { current: number }, mountedRef: { current: boolean },
 *   onSaved: () => void, onCommittedRef: { current: (() => void)|undefined },
 *   showToast: ((message: string) => void)|undefined,
 *   setAutoSaveStatus: (status: 'idle'|'pending'|'saved'|'failed') => void,
 *   pendingOwner: string, dateKey: string, patch: EffectivePatch }} ctx
 */
export function settleCloudDayWrite(result, ctx) {
  if (result.ok) {
    if (ctx.attemptRev === ctx.draftRevRef.current) ctx.onSaved()
    else ctx.onCommittedRef.current?.()
    return
  }
  if (result.toast) ctx.showToast?.(result.toast)
  if (!ctx.mountedRef.current) return
  ctx.setAutoSaveStatus('failed')
  // draft는 화면에 남는다. 나가기 전 확인에 걸리도록 표시만 하고 재시도 큐는 없다.
  markUnsafeRegistrationFailure(ctx.pendingOwner, ctx.dateKey, ctx.patch)
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
