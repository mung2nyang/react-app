// @ts-check
// durable(localStorage) 저수준 읽기·쓰기. "읽기 실패"와 "정상적으로 비어 있음"을 구분해 돌려주는 게 핵심이다 —
// 섞으면 빈 객체 위에 다시 써서 다른 날짜 원문을 지운다. 내부 값은 durablePatchSchema.js, dateKey는 domain/dateKey.js로 검증한다.
import { isValidCalendarDateKey } from '../domain/dateKey.js'
import { isValidPatch } from './durablePatchSchema.js'

/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
/** @typedef {import('./pendingWorkDataWritesTypes.js').EffectivePatch} EffectivePatch */
/** @typedef {import('./pendingWorkDataWritesTypes.js').DurableReadResult} DurableReadResult */
/** @typedef {import('./pendingWorkDataWritesTypes.js').OwnerEnumerationResult} OwnerEnumerationResult */

const DURABLE_KEY_PREFIX = 'reactPracticeDurablePendingWrites'

/** @param {string} ownerKey */
export function durableKey(ownerKey) {
  return `${DURABLE_KEY_PREFIX}:${ownerKey}`
}

/**
 * @param {string} ownerKey
 * @returns {DurableReadResult} localStorage 접근·JSON 파싱·최상위 모양·dateKey 형식·
 *   patch 스키마(콜상세 각 항목 포함) 중 하나라도 실패하면 `{ ok: false }`다 —
 *   절대 `{ ok: true, value: {} }`(정상적인 빈 큐)와 같은 뜻으로 쓰면 안 된다.
 *   그 owner가 애초에 이 키를 한 번도 쓴 적 없을 때만 `{ ok: true, value: {} }`다.
 */
export function readDurable(ownerKey) {
  let raw
  try {
    raw = localStorage.getItem(durableKey(ownerKey))
  } catch {
    return { ok: false }
  }
  if (raw === null) return { ok: true, value: {} }
  let parsed
  try {
    parsed = /** @type {JsonValue} */ (JSON.parse(raw))
  } catch {
    return { ok: false }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false }
  // dateKey 하나하나가 허용된 날짜 키 형식인지, patch
  // 하나하나가 실제 EffectivePatch 계약에 맞는지 전부 검증한다. 하나라도 어긋나면
  // 이 owner 전체를 읽기 실패로 취급한다(부분 신뢰 금지 — registerPendingDayWrite/
  // clearPendingDayWrite가 이 계약에 기대 원문을 보존한다).
  for (const [dateKey, patch] of Object.entries(parsed)) {
    if (!isValidCalendarDateKey(dateKey)) return { ok: false }
    if (!isValidPatch(patch)) return { ok: false }
  }
  return { ok: true, value: /** @type {Record<string, EffectivePatch>} */ (parsed) }
}

/** @param {string} ownerKey @param {Record<string, EffectivePatch>} value */
export function writeDurable(ownerKey, value) {
  localStorage.setItem(durableKey(ownerKey), JSON.stringify(value))
}

/**
 * localStorage.length/localStorage.key() 접근 자체가
 * 실패할 수 있다(브라우저 storage 전체가 막힌 극단 상황). 이걸 "owner가 하나도
 * 없다"로 오인하면 실제로 있는 durable 큐를 통째로 못 본 채 "pending 없음"으로
 * 거짓 판정한다 — 명시적으로 열거 실패를 구분해 돌려준다.
 * @returns {OwnerEnumerationResult}
 */
export function allDurableOwnerKeys() {
  /** @type {Set<string>} */
  const owners = new Set()
  let length
  try {
    length = localStorage.length
  } catch {
    return { ok: false }
  }
  for (let i = 0; i < length; i += 1) {
    let key
    try {
      key = localStorage.key(i)
    } catch {
      return { ok: false }
    }
    if (key?.startsWith(`${DURABLE_KEY_PREFIX}:`)) owners.add(key.slice(DURABLE_KEY_PREFIX.length + 1))
  }
  return { ok: true, owners: [...owners] }
}
