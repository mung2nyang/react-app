// @ts-check
// durable 큐의 owner/date 병합 스캔. pendingWorkDataWrites.js가 200줄을 넘기지 않도록
// 저수준 맵·복합키·effective 항목 계산만 여기 둔다. 주석·검증 의미는 옮기기 전과 같다.
import { allDurableOwnerKeys, readDurable } from './durableStorage.js'

/** @typedef {import('./pendingWorkDataWritesTypes.js').EffectivePatch} EffectivePatch */

// durable 기록 실패 시만 쓰는 세션 한정 fallback. 키 결합의 U+0000 구분자는 실제
// NUL 바이트를 소스에 박지 않고 String.fromCharCode(0)으로 런타임에 만든다.
export const KEY_SEP = String.fromCharCode(0)
/** @type {Map<string, EffectivePatch>} */
export const fallback = new Map()
/** @type {Map<string, (ok: boolean) => void>} */
export const settledCallbacks = new Map()

/** @param {string} ownerKey @param {string} dateKey */
export function keyOf(ownerKey, dateKey) {
  return `${ownerKey}${KEY_SEP}${dateKey}`
}

/**
 * durable(모든 owner)과 fallback을 owner/date 복합키로 병합한 "지금 실제로 존재하는
 * pending 항목" 맵(fallback이 durable 위를 덮어써서 키마다 값 하나만 남는다). 아래
 * 4개 export가 이 함수 하나를 공유한다. durable 읽기가 실패한 owner는
 * `unreadableOwners`에, owner 목록 열거 자체가 실패하면 durable 스캔을 통째로
 * 건너뛰고 `ownerEnumerationFailed: true`를 돌려준다 — fallback은 그래도 포함한다.
 * @returns {{
 *   entries: Map<string, { ownerKey: string, dateKey: string, patch: EffectivePatch }>,
 *   unreadableOwners: Set<string>,
 *   ownerEnumerationFailed: boolean,
 * }}
 */
export function computeEffectivePendingEntries() {
  /** @type {Map<string, { ownerKey: string, dateKey: string, patch: EffectivePatch }>} */
  const entries = new Map()
  /** @type {Set<string>} */
  const unreadableOwners = new Set()
  const ownerList = allDurableOwnerKeys()
  if (ownerList.ok) {
    ownerList.owners.forEach((ownerKey) => {
      const result = readDurable(ownerKey)
      if (!result.ok) {
        unreadableOwners.add(ownerKey)
        return
      }
      Object.entries(result.value).forEach(([dateKey, patch]) => {
        entries.set(keyOf(ownerKey, dateKey), { ownerKey, dateKey, patch })
      })
    })
  }
  fallback.forEach((patch, key) => {
    const [ownerKey, dateKey] = key.split(KEY_SEP)
    entries.set(key, { ownerKey, dateKey, patch })
  })
  return { entries, unreadableOwners, ownerEnumerationFailed: !ownerList.ok }
}
