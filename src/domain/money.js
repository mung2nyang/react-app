// @ts-check
/** @typedef {import('../data/sync/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */

/**
 * @param {JsonValue|undefined} str
 * @returns {number}
 */
export function parseCurrencyValue(str) {
  if (!str) return 0
  return parseInt(String(str).replace(/[^0-9]/g, ''), 10) || 0
}

/**
 * @param {JsonValue|undefined} amount
 * @returns {string}
 */
export function formatWon(amount) {
  return `${Math.max(0, Number(amount) || 0).toLocaleString('ko-KR')}원`
}

/**
 * @param {JsonValue|undefined} value
 * @returns {string}
 */
export function formatCurrencyInput(value) {
  const n = parseCurrencyValue(value)
  return n ? n.toLocaleString('ko-KR') : ''
}

/**
 * 금액 칸에 친 글자(소수점 포함)를 반올림한 쉼표 정수 글자로 — 첫 점만 소수점으로 본다(로드맵 43).
 * @param {string|undefined} text
 * @returns {string}
 */
export function roundCurrencyText(text) {
  const raw = String(text ?? '').replace(/[^0-9.]/g, '')
  const dot = raw.indexOf('.')
  const intPart = dot >= 0 ? raw.slice(0, dot) : raw
  const fracPart = dot >= 0 ? raw.slice(dot + 1).replace(/\./g, '') : ''
  const n = Math.round(Number(`${intPart || '0'}.${fracPart || '0'}`))
  return n ? n.toLocaleString('ko-KR') : ''
}

// 운송료가 이 금액을 넘으면 저장 전에 한 번 묻는다(로드맵 43-C, 보리 결정 2026-10-14 — 운송료만).
export const LARGE_FARE_LIMIT = 10000000

/** @param {JsonValue|undefined} text 쉼표 금액 글자 @returns {boolean} */
export function isLargeFare(text) {
  return parseCurrencyValue(text) > LARGE_FARE_LIMIT
}

/**
 * @param {JsonValue|undefined} value
 * @returns {string}
 */
export function formatPercentInput(value) {
  let next = String(value || '').replace(/[^0-9.]/g, '')
  if (parseFloat(next) > 100) next = '100'
  return next
}

// formatFareShort(달력 셀 짧은 금액 표기)는 calendarBadges.js에 있다.
