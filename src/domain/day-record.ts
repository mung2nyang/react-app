// 날짜별 운행 기록(workData[dateKey]) 파생 계산 + 저장 형태 정규화. DayRecordLike/CallDetailLike
// 정본은 각각 dayRecordTypes.ts/callDetail.ts — DayRecordLike는 이 파일 경로로 부르는 곳이 있어 이름만 이어 준다.
import { dedupeCallDetailsById, withCoercedCallDetailId } from './callDetailIds.ts'
import { getDetailPaymentSummary } from './finance.ts'
import { parseCurrencyValue, vatOf } from './money.ts'
import type { DayRecordLike } from './dayRecordTypes.ts'
import type { CallDetailLike } from './callDetail.ts'

export type { DayRecordLike }

export function getFixedCount(record: DayRecordLike | null | undefined) {
  if (record?.isOff) return 0
  return Math.max(0, parseInt(String(record?.fixedCount), 10) || 0)
}

// 파렛트 회수 횟수. 고정노선 거래처의 palletOn이 켜져 있을 때만 집계에 쓰이지만
// 값 자체는 항상 정확히 저장해 둔다.
export function getPalletCount(record: DayRecordLike | null | undefined) {
  if (record?.isOff) return 0
  return Math.max(0, parseInt(String(record?.palletCount), 10) || 0)
}

// 아래 typeof/Array.isArray 확인은 hydrate로 들어온 값처럼 모양이 어긋날 수 있는 데이터 방어라 남긴다.
export function getFixedRouteCounts(record: { fixedRouteCounts?: Record<string, number> } | null | undefined) {
  const counts = record?.fixedRouteCounts
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return {}
  const next: Record<string, number> = {}
  Object.entries(counts).forEach(([routeId, value]) => {
    const n = parseInt(String(value), 10) || 0
    if (n > 0) next[routeId] = n
  })
  return next
}

export function applyFixedRouteRun(counts: Record<string, number> | undefined, routeId: string, delta: number) {
  const next = { ...getFixedRouteCounts({ fixedRouteCounts: counts }) }
  const value = Math.max(0, (next[routeId] || 0) + delta)
  if (value <= 0) delete next[routeId]
  else next[routeId] = value
  return next
}

export function isOffDay(record: DayRecordLike | null | undefined) {
  return !!record?.isOff
}

// id 유무는 신경 쓰지 않는다 — id가 항상 있어야 하는 유일한 소비자(day-log/ UI)는
// useDayDraft.js가 마운트 시 backfillCallDetailIds로 미리 채운 레코드만 넘긴다.
export function getCallDetails(record: DayRecordLike | null | undefined) {
  return Array.isArray(record?.callDetails) ? record.callDetails : []
}

// id 없는 레거시 콜상세를 로드 시 한 번 영구 id로 채운다(순수 계산, 반영은 호출부, 이미 있으면 같은 참조).
// call-details.ts와 같은 `trp_` 접두어를 순환 참조 없이 여기서 만든다.
export function backfillCallDetailIds(record: DayRecordLike | undefined): { record: DayRecordLike | undefined, changed: boolean } {
  const list = Array.isArray(record?.callDetails) ? record.callDetails : []
  if (list.length === 0) return { record, changed: false }
  let changed = false
  const callDetails = list.map((item) => {
    const coerced = withCoercedCallDetailId(item)
    if (coerced !== item) {
      changed = true
      return coerced
    }
    if (item?.id) return item
    changed = true
    return { ...item, id: `trp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }
  })
  if (!changed) return { record, changed: false }
  return { record: { ...record, callDetails }, changed: true }
}

/** 콜 한 건이 운행 횟수에 들어가는지 — 공차·다른 운행에 묶인 혼짐은 빼고, 묶일 운행을 안 고른 혼짐은 넣는다. */
export function callCountsAsTrip(detail: CallDetailLike | null | undefined) {
  const type = detail?.distanceType || ''
  if (type === '공차') return false
  if (type === '혼짐') return detail?.linkedLoadIndex === 'pending' || detail?.linkedLoadIndex === '-1' || detail?.linkedLoadIndex === undefined
  return true
}

export function countCallTrips(record: DayRecordLike | null | undefined) {
  if (!record || record.isOff) return 0
  return getCallDetails(record).filter(callCountsAsTrip).length
}

export function dayTripCount(record: DayRecordLike | null | undefined) {
  return getFixedCount(record) + countCallTrips(record)
}

/** 하루 운행 거리(km) — 콜 상세에 거리가 하나라도 있으면 그 합, 없으면 하루 거리(dailyDistance). */
export function getRecordTotalDistance(record: DayRecordLike | null | undefined) {
  const details = getCallDetails(record)
  const hasDetailDistance = details.some((d) => String(d?.distanceKm ?? '').trim() !== '')
  if (hasDetailDistance) {
    return details.reduce((sum, d) => sum + (parseFloat(String(d?.distanceKm)) || 0), 0)
  }
  return parseFloat(String(record?.dailyDistance ?? '')) || 0
}

export function callFareTotal(record: DayRecordLike | null | undefined) {
  if (!record || record.isOff) return 0
  return getCallDetails(record).reduce((sum, detail) => sum + parseCurrencyValue(detail.fare), 0)
}

export function callVatTotal(record: DayRecordLike | null | undefined) {
  if (!record || record.isOff) return 0
  return getCallDetails(record).reduce((sum, detail) => {
    const fare = parseCurrencyValue(detail.fare)
    return sum + (detail.vatExempt ? 0 : vatOf(fare))
  }, 0)
}

export function monthWorkFareSummary(data: Record<string, DayRecordLike>, year: number, month: number, unitPrice: number | string) {
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
  const vat = vatOf(fixedFare) + callVat
  return { trips, callTrips, fixedFare, callFare, fare, vat, total: fare + vat }
}

export function saveDayRecord(data: Record<string, DayRecordLike>, dateKey: string, { isOff = false, fixedCount = 0, callDetails, fixedRouteCounts, palletCount }: { isOff?: boolean, fixedCount?: number | string, callDetails?: Array<CallDetailLike>, fixedRouteCounts?: Record<string, number>, palletCount?: number | string } = {}): Record<string, DayRecordLike> {
  const next = { ...data }
  const off = !!isOff
  const count = off ? 0 : Math.max(0, parseInt(String(fixedCount), 10) || 0)
  const prev = next[dateKey] || {}
  const details = dedupeCallDetailsById(Array.isArray(callDetails) ? callDetails : getCallDetails(prev))
  const routeCounts = off ? {} : getFixedRouteCounts({
    fixedRouteCounts: fixedRouteCounts !== undefined ? fixedRouteCounts : prev.fixedRouteCounts,
  })
  // palletCount도 파렛트 섹션이 꺼져 있으면 0으로 정규화(fixedCount와 같은 규칙,
  // "빈 날" 판정에도 반영). 배정차량 값이 있는 날(7-D 복사분)은 비워도 지우지 않는다.
  const pallets = off ? 0 : Math.max(0, parseInt(String(palletCount !== undefined ? palletCount : prev.palletCount), 10) || 0)

  if (!off && count === 0 && pallets === 0 && details.length === 0 && !prev.assignedVehicleNumber) {
    delete next[dateKey]
  } else {
    const restPrev = { ...prev }
    delete restPrev.fuelItems
    delete restPrev.maintItems
    delete restPrev.miscItems
    next[dateKey] = {
      ...restPrev,
      isOff: off,
      fixedCount: count,
      callDetails: details,
      fixedRouteCounts: routeCounts,
      palletCount: pallets,
    }
  }
  return next
}

export function monthCallUnpaidTotal(data: Record<string, DayRecordLike>, year: number, month: number) {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
  let total = 0
  for (const [key, record] of Object.entries(data || {})) {
    if (!key.startsWith(prefix) || isOffDay(record)) continue
    getCallDetails(record).forEach((detail) => {
      const summary = getDetailPaymentSummary(detail)
      if (summary.status !== 'paid') total += summary.remainingAmount
    })
  }
  return total
}

export function monthWorkTotal(data: Record<string, DayRecordLike>, year: number, month: number) {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
  let total = 0
  for (const [key, record] of Object.entries(data)) {
    if (key.startsWith(prefix)) total += getFixedCount(record)
  }
  return total
}

// 하루치 뱃지 계산(dayFareTotal/dayWorkBadgeLabel/dayHasUnpaid)은 calendarBadges.ts로.
