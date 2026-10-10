// @ts-check
/** @typedef {import('../lib/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */

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
 * @param {JsonValue|undefined} value
 * @returns {string}
 */
export function formatPercentInput(value) {
  let next = String(value || '').replace(/[^0-9.]/g, '')
  if (parseFloat(next) > 100) next = '100'
  return next
}

// formatFareShort(달력 셀 짧은 금액 표기)는 calendarBadges.js에 있다.
