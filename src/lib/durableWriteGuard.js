// @ts-check
// 재감사 4차(FAIL 지적 2번) — 이전 버전은 전역 boolean 하나라 owner A의 fallback이
// 남은 동안 owner B 성공이 전체를 healthy로 만들었다. 지금은 pending의 fallback과
// unsafe 맵을 owner/date 키로 본다.
// 재감사 16차 — unsafe는 invalid dateKey/patch(register false)만 들어가며, 자동
// promote/retry 대상이 아니다. beforeunload·화면 이동 방어와 재진입 overlay용.
import { hasUnsafePendingWrites } from './pendingWorkDataWrites.js'
import { pulsePendingRetry } from './pendingRetryPulse.js'

/** @typedef {import('./pendingWorkDataWritesTypes.js').EffectivePatch} EffectivePatch */

const KEY_SEP = String.fromCharCode(0)
/** @type {Map<string, EffectivePatch>} */
const unsafeUnregistered = new Map()

/** @param {string} ownerKey @param {string} dateKey */
function keyOf(ownerKey, dateKey) {
  return `${ownerKey}${KEY_SEP}${dateKey}`
}

/** @param {string} key */
function splitKey(key) {
  const sep = key.indexOf(KEY_SEP)
  return { ownerKey: key.slice(0, sep), dateKey: key.slice(sep + 1) }
}

/**
 * @param {string} ownerKey
 * @param {string} dateKey
 * @param {EffectivePatch} patch
 */
export function markUnsafeRegistrationFailure(ownerKey, dateKey, patch) {
  unsafeUnregistered.set(keyOf(ownerKey, dateKey), patch)
  pulsePendingRetry()
}

/** @param {string} ownerKey @param {string} dateKey */
export function clearUnsafeRegistrationFailure(ownerKey, dateKey) {
  unsafeUnregistered.delete(keyOf(ownerKey, dateKey))
  pulsePendingRetry()
}

/** @param {string} ownerKey @param {string} dateKey */
export function hasUnsafeRegistration(ownerKey, dateKey) {
  return unsafeUnregistered.has(keyOf(ownerKey, dateKey))
}

/** @param {string} ownerKey @param {string} dateKey @returns {EffectivePatch|undefined} */
export function getUnsafeRegistrationPatch(ownerKey, dateKey) {
  return unsafeUnregistered.get(keyOf(ownerKey, dateKey))
}

export function hasAnyUnsafeRegistration() {
  return unsafeUnregistered.size > 0
}

/** @returns {Array<{ ownerKey: string, dateKey: string, patch: EffectivePatch }>} */
export function listUnsafeRegistrations() {
  return [...unsafeUnregistered].map(([key, patch]) => ({ ...splitKey(key), patch }))
}

export function isDurableWriteBroken() {
  return hasUnsafePendingWrites() || unsafeUnregistered.size > 0
}

/**
 * @param {{ preventDefault: () => void, returnValue?: boolean }} event
 */
export function guardBeforeUnload(event) {
  if (!isDurableWriteBroken()) return
  event.preventDefault()
  event.returnValue = true
}

/** @returns {boolean} true면 이동을 진행해도 된다. */
export function confirmLeaveIfUnsafe() {
  if (!isDurableWriteBroken()) return true
  return window.confirm('마지막 편집을 아직 안전하게 저장하지 못했습니다. 그래도 나가시겠습니까?')
}
