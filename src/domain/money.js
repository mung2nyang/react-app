// @ts-check

/**
 * @param {unknown} str
 * @returns {number}
 */
export function parseCurrencyValue(str) {
  if (!str) return 0
  return parseInt(String(str).replace(/[^0-9]/g, ''), 10) || 0
}

/**
 * @param {unknown} supplyAmount
 * @param {boolean} [vatExempt]
 * @returns {number}
 */
export function calcSupplyVat(supplyAmount, vatExempt = false) {
  if (vatExempt) return 0
  return Math.round(Number(supplyAmount) * 0.1)
}

/**
 * @param {unknown} amount
 * @returns {string}
 */
export function formatWon(amount) {
  return `${Math.max(0, Number(amount) || 0).toLocaleString('ko-KR')} 원`
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function formatCurrencyInput(value) {
  const n = parseCurrencyValue(value)
  return n ? n.toLocaleString('ko-KR') : ''
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function formatPercentInput(value) {
  let next = String(value || '').replace(/[^0-9.]/g, '')
  if (parseFloat(next) > 100) next = '100'
  return next
}

// formatFareShort(달력 셀 fare 뱃지용 짧은 금액 표기)는 calendarBadges.js로 옮겼다
// (Step 5 재감사 3번 — 타입 전용 모듈 분리).

/**
 * @param {unknown} tripCount
 * @param {unknown} unitPrice
 * @returns {{ fare: number, vat: number, total: number }}
 */
export function monthFareSummary(tripCount, unitPrice) {
  const trips = Math.max(0, parseInt(String(tripCount), 10) || 0)
  const unit = Math.max(0, parseCurrencyValue(unitPrice))
  const fare = trips * unit
  const vat = Math.round(fare * 0.1)
  return { fare, vat, total: fare + vat }
}
