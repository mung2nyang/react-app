import { getDetailPaymentSummary, syncDetailPaymentStatus } from './finance.js'
import { parseCurrencyValue } from './money.js'
import { scheduleCloudSync } from './cloudSync.js'

const STORAGE_PREFIX = 'reactPracticeWorkData'

export function loadWorkData(ownerKey = 'guest') {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${ownerKey}`)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveWorkData(ownerKey, data) {
  localStorage.setItem(`${STORAGE_PREFIX}:${ownerKey}`, JSON.stringify(data))
  scheduleCloudSync()
}

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

export function buildCallDetail(draft, existing, dateKey, clients = []) {
  const loadLoc = String(draft.loadLoc || '').trim()
  const unloadLoc = String(draft.unloadLoc || '').trim()
  const fareInput = String(draft.fare ?? '').trim()
  const client = String(draft.client || '').trim()
  if (!fareInput && !loadLoc && !unloadLoc) {
    return { error: '운임 또는 상·하차지 중 하나를 입력해 주세요.' }
  }

  const matchedClient = (clients || []).find((item) => item.companyName === client)
  const commissionSnapshot = (matchedClient && matchedClient.commEnabled)
    ? { enabled: true, type: matchedClient.commType, value: matchedClient.commValue }
    : { enabled: false, type: null, value: null }

  const startOdometer = String(draft.startOdometer ?? existing?.startOdometer ?? '').trim()
  const endOdometer = String(draft.endOdometer ?? existing?.endOdometer ?? '').trim()
  const distanceKm = computeDistanceKm(startOdometer, endOdometer, draft.distanceKm ?? existing?.distanceKm)

  return {
    item: {
      loadLoc,
      unloadLoc,
      fare: fareInput,
      client,
      clientId: matchedClient?.id || null,
      commissionSnapshot,
      remarks: String(draft.remarks || '').trim(),
      vatExempt: !!draft.vatExempt,
      paymentStatus: existing?.paymentStatus || '미수',
      payments: Array.isArray(existing?.payments) ? existing.payments : [],
      paymentDueDate: String(draft.paymentDueDate || '').trim(),
      workDate: dateKey,
      distanceType: existing?.distanceType || '',
      linkedLoadIndex: existing?.linkedLoadIndex,
      departureTime: String(draft.departureTime ?? existing?.departureTime ?? '').trim(),
      arrivalTime: String(draft.arrivalTime ?? existing?.arrivalTime ?? '').trim(),
      platform: String(draft.platform ?? existing?.platform ?? '').trim(),
      cargoTonnage: String(draft.cargoTonnage ?? existing?.cargoTonnage ?? '').trim(),
      receipt: String(draft.receipt ?? existing?.receipt ?? '').trim(),
      startOdometer,
      endOdometer,
      distanceKm,
    },
  }
}

export function computeDistanceKm(startOdometer, endOdometer, fallback = '') {
  const startRaw = String(startOdometer || '').trim()
  const endRaw = String(endOdometer || '').trim()
  if (startRaw && endRaw) {
    const start = parseCurrencyValue(startRaw)
    const end = parseCurrencyValue(endRaw)
    return end >= start ? String(end - start) : ''
  }
  return String(fallback || '').trim()
}

export function upsertCallDetail(details, draft, editingIndex, dateKey, clients = []) {
  const list = [...(details || [])]
  const existing = editingIndex >= 0 ? list[editingIndex] : null
  const result = buildCallDetail(draft, existing, dateKey, clients)
  if (result.error) return { error: result.error, items: details }

  if (editingIndex >= 0) {
    if (!existing) return { error: '세부 입력을 찾지 못했습니다.', items: details }
    list[editingIndex] = result.item
    return { items: list }
  }

  list.push(result.item)
  return { items: list }
}

export function removeCallDetail(details, index) {
  return (details || []).filter((_, i) => i !== index)
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

export function generateLocalId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function withCallDetail(data, dateKey, detailIndex, mutator) {
  const record = data?.[dateKey]
  const details = getCallDetails(record)
  if (!record || !details[detailIndex]) return { error: '세부 입력을 찾지 못했습니다.', data }
  const nextDetails = details.map((item, index) => (index === detailIndex ? { ...item, payments: Array.isArray(item.payments) ? [...item.payments] : item.payments } : item))
  const detail = nextDetails[detailIndex]
  const error = mutator(detail)
  if (error) return { error, data }
  const next = { ...data, [dateKey]: { ...record, callDetails: nextDetails } }
  return { data: next }
}

function ensurePaymentList(detail) {
  if (Array.isArray(detail.payments)) return
  detail.payments = []
  if ((detail.paymentStatus || '미수') !== '미수') {
    const fare = parseCurrencyValue(detail.fare)
    if (fare > 0) {
      detail.payments.push({ id: generateLocalId('pay'), amount: fare, paidAt: new Date().toISOString(), note: '(이전 기록)' })
    }
  }
}

export function addPartialPayment(data, dateKey, detailIndex, amount, paidAt = new Date()) {
  return withCallDetail(data, dateKey, detailIndex, (detail) => {
    const value = parseCurrencyValue(amount)
    if (!(value > 0)) return '입금액을 올바르게 입력해 주세요.'
    const summary = getDetailPaymentSummary(detail)
    if (value > summary.remainingAmount) return '남은 금액보다 큰 금액은 입력할 수 없습니다.'
    ensurePaymentList(detail)
    detail.payments = [...(detail.payments || []), {
      id: generateLocalId('pay'),
      amount: value,
      paidAt: paidAt instanceof Date ? paidAt.toISOString() : paidAt,
      note: '',
    }]
    syncDetailPaymentStatus(detail)
    return null
  })
}

export function undoLastPayment(data, dateKey, detailIndex) {
  return withCallDetail(data, dateKey, detailIndex, (detail) => {
    if (!Array.isArray(detail.payments) || detail.payments.length === 0) {
      return '되돌릴 입금 기록이 없습니다.'
    }
    detail.payments = detail.payments.slice(0, -1)
    syncDetailPaymentStatus(detail)
    return null
  })
}

export function markReceivableItemPaid(data, dateKey, detailIndex, paidAt = new Date()) {
  return withCallDetail(data, dateKey, detailIndex, (detail) => {
    const summary = getDetailPaymentSummary(detail)
    if (summary.status === 'paid') return '이미 처리된 내역입니다.'
    ensurePaymentList(detail)
    if (summary.remainingAmount > 0) {
      detail.payments = [...detail.payments, {
        id: generateLocalId('pay'),
        amount: summary.remainingAmount,
        paidAt: paidAt instanceof Date ? paidAt.toISOString() : paidAt,
        note: '',
      }]
    }
    syncDetailPaymentStatus(detail)
    return null
  })
}

export function toggleCallPaymentStatus(data, dateKey, detailIndex, paidAt = new Date()) {
  const detail = getCallDetails(data?.[dateKey])[detailIndex]
  if (!detail) return { error: '세부 입력을 찾지 못했습니다.', data }
  if (getDetailPaymentSummary(detail).status === 'paid') {
    return withCallDetail(data, dateKey, detailIndex, (item) => {
      item.payments = []
      syncDetailPaymentStatus(item)
      return null
    })
  }
  return markReceivableItemPaid(data, dateKey, detailIndex, paidAt)
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
