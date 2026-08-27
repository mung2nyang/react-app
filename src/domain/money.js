export function parseCurrencyValue(str) {
  if (!str) return 0
  return parseInt(String(str).replace(/[^0-9]/g, ''), 10) || 0
}

export function calcSupplyVat(supplyAmount, vatExempt = false) {
  if (vatExempt) return 0
  return Math.round(Number(supplyAmount) * 0.1)
}

export function formatWon(amount) {
  return `${Math.max(0, Number(amount) || 0).toLocaleString('ko-KR')} 원`
}

export function formatCurrencyInput(value) {
  const n = parseCurrencyValue(value)
  return n ? n.toLocaleString('ko-KR') : ''
}

export function formatPercentInput(value) {
  let next = String(value || '').replace(/[^0-9.]/g, '')
  if (parseFloat(next) > 100) next = '100'
  return next
}

// formatFareShort(달력 셀 fare 뱃지용 짧은 금액 표기)는 calendarBadges.js로 옮겼다
// (Step 5 재감사 3번 — 타입 전용 모듈 분리, 이 파일은 아직 // @ts-check 없음).

export function monthFareSummary(tripCount, unitPrice) {
  const trips = Math.max(0, parseInt(tripCount, 10) || 0)
  const unit = Math.max(0, parseCurrencyValue(unitPrice))
  const fare = trips * unit
  const vat = Math.round(fare * 0.1)
  return { fare, vat, total: fare + vat }
}
