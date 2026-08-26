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

export function monthFareSummary(tripCount, unitPrice) {
  const trips = Math.max(0, parseInt(tripCount, 10) || 0)
  const unit = Math.max(0, parseCurrencyValue(unitPrice))
  const fare = trips * unit
  const vat = Math.round(fare * 0.1)
  return { fare, vat, total: fare + vat }
}
