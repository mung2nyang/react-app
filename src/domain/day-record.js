// 날짜별 운행 기록(workData[dateKey]) 파생 계산 + 저장 형태 정규화.
// migration-plan.md의 domain/day-record.ts에 대응하는 자리 — Step 4에서 domain/으로
// 옮길 때까지는 lib/ 안에서 workData.js와 분리된 파일로만 유지한다 (Step 1: 200줄 제한 준수).
import { getDetailPaymentSummary } from './finance.js'
import { parseCurrencyValue } from './money.js'

export function getFixedCount(record) {
  if (record?.isOff) return 0
  return Math.max(0, parseInt(record?.fixedCount, 10) || 0)
}

export function getFixedRouteCounts(record) {
  const counts = record?.fixedRouteCounts
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return {}
  const next = {}
  Object.entries(counts).forEach(([routeId, value]) => {
    const n = parseInt(value, 10) || 0
    if (n > 0) next[routeId] = n
  })
  return next
}

export function applyFixedRouteRun(counts, routeId, delta) {
  const next = { ...getFixedRouteCounts({ fixedRouteCounts: counts }) }
  const value = Math.max(0, (next[routeId] || 0) + delta)
  if (value <= 0) delete next[routeId]
  else next[routeId] = value
  return next
}

export function isOffDay(record) {
  return !!record?.isOff
}

export function getCallDetails(record) {
  return Array.isArray(record?.callDetails) ? record.callDetails : []
}

export function countCallTrips(record) {
  if (!record || record.isOff) return 0
  let count = 0
  getCallDetails(record).forEach((detail) => {
    const type = detail?.distanceType || ''
    if (type === '공차') return
    if (type === '혼짐') {
      if (detail.linkedLoadIndex === 'pending' || detail.linkedLoadIndex === '-1' || detail.linkedLoadIndex === undefined) {
        count += 1
      }
      return
    }
    count += 1
  })
  return count
}

export function dayTripCount(record) {
  return getFixedCount(record) + countCallTrips(record)
}

export function callFareTotal(record) {
  if (!record || record.isOff) return 0
  return getCallDetails(record).reduce((sum, detail) => sum + parseCurrencyValue(detail.fare), 0)
}

export function callVatTotal(record) {
  if (!record || record.isOff) return 0
  return getCallDetails(record).reduce((sum, detail) => {
    const fare = parseCurrencyValue(detail.fare)
    return sum + (detail.vatExempt ? 0 : Math.round(fare * 0.1))
  }, 0)
}

export function monthWorkFareSummary(data, year, month, unitPrice) {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
  let trips = 0
  let callTrips = 0
  let callFare = 0
  let callVat = 0
  for (const [key, record] of Object.entries(data || {})) {
    if (!key.startsWith(prefix)) continue
    trips += getFixedCount(record)
    callTrips += countCallTrips(record)
    callFare += callFareTotal(record)
    callVat += callVatTotal(record)
  }
  const unit = Math.max(0, parseCurrencyValue(unitPrice))
  const fixedFare = trips * unit
  const fare = fixedFare + callFare
  const vat = Math.round(fixedFare * 0.1) + callVat
  return { trips, callTrips, fixedFare, callFare, fare, vat, total: fare + vat }
}

export function saveDayRecord(data, dateKey, { isOff = false, fixedCount = 0, callDetails, fixedRouteCounts } = {}) {
  const next = { ...data }
  const off = !!isOff
  const count = off ? 0 : Math.max(0, parseInt(fixedCount, 10) || 0)
  const prev = next[dateKey] || {}
  const details = Array.isArray(callDetails) ? callDetails : getCallDetails(prev)
  const routeCounts = getFixedRouteCounts({
    fixedRouteCounts: fixedRouteCounts !== undefined ? fixedRouteCounts : prev.fixedRouteCounts,
  })

  if (!off && count === 0 && details.length === 0) {
    delete next[dateKey]
  } else {
    next[dateKey] = {
      ...prev,
      isOff: off,
      fixedCount: count,
      callDetails: details,
      fixedRouteCounts: routeCounts,
    }
  }
  return next
}

export function monthCallUnpaidTotal(data, year, month) {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
  let total = 0
  for (const [key, record] of Object.entries(data || {})) {
    if (!key.startsWith(prefix)) continue
    getCallDetails(record).forEach((detail) => {
      const summary = getDetailPaymentSummary(detail)
      if (summary.status !== 'paid') total += summary.remainingAmount
    })
  }
  return total
}

export function monthWorkTotal(data, year, month) {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
  let total = 0
  for (const [key, record] of Object.entries(data)) {
    if (key.startsWith(prefix)) total += getFixedCount(record)
  }
  return total
}
