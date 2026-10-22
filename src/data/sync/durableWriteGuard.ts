// pending의 fallback·unsafe를 owner/date 키로 본다(owner 하나 성공이 전체를 정상으로 만들지 않게).
// unsafe는 잘못된 dateKey/patch라 자동 재시도 대상이 아니고, 화면 이동 경고와 다시 들어올 때 덮어 보여 주기용이다.
import { hasUnsafePendingWrites } from './pendingWorkDataWrites.ts'
import { pulsePendingRetry } from './pendingRetryPulse.ts'
import { flushDayDrafts, hasBusyDayDraft } from './dayDraftActivity.ts'
import type { EffectivePatch } from './pendingWorkDataWritesTypes.ts'

const KEY_SEP = String.fromCharCode(0)
const unsafeUnregistered: Map<string, EffectivePatch> = new Map()

function keyOf(ownerKey: string, dateKey: string) {
  return `${ownerKey}${KEY_SEP}${dateKey}`
}

function splitKey(key: string) {
  const sep = key.indexOf(KEY_SEP)
  return { ownerKey: key.slice(0, sep), dateKey: key.slice(sep + 1) }
}

export function markUnsafeRegistrationFailure(ownerKey: string, dateKey: string, patch: EffectivePatch) {
  unsafeUnregistered.set(keyOf(ownerKey, dateKey), patch)
  pulsePendingRetry()
}

export function clearUnsafeRegistrationFailure(ownerKey: string, dateKey: string) {
  unsafeUnregistered.delete(keyOf(ownerKey, dateKey))
  pulsePendingRetry()
}

export function hasUnsafeRegistration(ownerKey: string, dateKey: string) {
  return unsafeUnregistered.has(keyOf(ownerKey, dateKey))
}

export function getUnsafeRegistrationPatch(ownerKey: string, dateKey: string): EffectivePatch | undefined {
  return unsafeUnregistered.get(keyOf(ownerKey, dateKey))
}

export function hasAnyUnsafeRegistration() {
  return unsafeUnregistered.size > 0
}

export function listUnsafeRegistrations(): Array<{ ownerKey: string, dateKey: string, patch: EffectivePatch }> {
  return [...unsafeUnregistered].map(([key, patch]) => ({ ...splitKey(key), patch }))
}

export function isDurableWriteBroken() {
  return hasUnsafePendingWrites() || unsafeUnregistered.size > 0
}

export function guardBeforeUnload(event: { preventDefault: () => void, returnValue?: boolean }) {
  // 기다리던 일지 저장을 먼저 시작한다 — 기기 저장은 여기서 끝나고, 서버 저장 중이면 막는다.
  flushDayDrafts()
  if (!isDurableWriteBroken() && !hasBusyDayDraft()) return
  event.preventDefault()
  event.returnValue = true
}

/** @returns true면 이동을 진행해도 된다. */
export function confirmLeaveIfUnsafe(): boolean {
  if (!isDurableWriteBroken()) return true
  return window.confirm('방금 고친 내용이 아직 저장되지 않았습니다. 그래도 나가시겠습니까?')
}

/** 새로고침·로그아웃처럼 앱을 떠나는 이동. 앱 안 이동은 confirmLeaveIfUnsafe(닫히는 화면이 저장을 마저 한다). */
export function confirmReloadIfUnsaved(): boolean {
  flushDayDrafts()
  if (hasBusyDayDraft()) return window.confirm('방금 고친 내용을 아직 저장하는 중입니다. 그래도 나가시겠습니까?')
  return confirmLeaveIfUnsafe()
}
