// @ts-check
// 프로필·기사 슬라이스 구독. getSnapshot에서 empty 병합·새 배열을 만들면
// 관계없는 notify에도 참조가 바뀌어 렌더 루프가 난다 — 원본만 구독한다.
import { useMemo, useSyncExternalStore } from 'react'
import { EMPTY_PROFILE } from '../lib/profile.js'
import { getState, subscribe } from './app-store.js'

/** @typedef {import('../lib/outboxTypes.js').DriverRecord} DriverRecord */

const EMPTY_DRIVERS = /** @type {Array<DriverRecord>} */ ([])

/**
 * 조립·쓰기 직전용. 매 호출마다 병합 객체를 만들 수 있으니
 * useSyncExternalStore getSnapshot에는 쓰지 말 것.
 * @param {string} ownerKey
 */
export function readOwnerProfile(ownerKey) {
  const raw = getState().profile[ownerKey]
  if (!raw || typeof raw !== 'object') return EMPTY_PROFILE
  return { ...EMPTY_PROFILE, ...raw }
}

/** @param {string} ownerKey */
export function useOwnerProfile(ownerKey) {
  const raw = useSyncExternalStore(subscribe, () => getState().profile[ownerKey])
  return useMemo(
    () => (raw && typeof raw === 'object' ? { ...EMPTY_PROFILE, ...raw } : EMPTY_PROFILE),
    [raw],
  )
}

/** @param {string} ownerKey */
export function readOwnerDrivers(ownerKey) {
  return getState().drivers[ownerKey] || EMPTY_DRIVERS
}

/** @param {string} ownerKey */
export function useOwnerDrivers(ownerKey) {
  return useSyncExternalStore(subscribe, () => readOwnerDrivers(ownerKey))
}
