// @ts-check
// 날짜별 운행 기록(workData[dateKey]) 파생 계산 + 저장 형태 정규화.
// migration-plan.md의 domain/day-record.ts 자리. DayRecordLike/CallDetailLike
// 정본은 각각 dayRecordTypes.js/callDetail.js — 여기선 alias만 한다.
import { getDetailPaymentSummary } from './finance.js'
import { parseCurrencyValue } from './money.js'

/** @typedef {import('./dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {import('./callDetail.js').CallDetailLike} CallDetailLike */

/** @param {DayRecordLike|null|undefined} record */
export function getFixedCount(record) {
  if (record?.isOff) return 0
  return Math.max(0, parseInt(String(record?.fixedCount), 10) || 0)
}

// 파렛트 회수 횟수. 고정노선 거래처의 palletOn이 켜져 있을 때만 집계에 쓰이지만
// (Step 7 몫), 값 자체는 항상 정확히 저장해 둔다.
/** @param {DayRecordLike|null|undefined} record */
export function getPalletCount(record) {
  if (record?.isOff) return 0
  return Math.max(0, parseInt(String(record?.palletCount), 10) || 0)
}

// 재감사 4차(FAIL 지적 4번) — 예전엔 fixedRouteCounts를 unknown으로 받고 런타임에
// typeof/Array.isArray로 검증했다. 이 함수를 실제로 부르는 두 자리(day-record.js
// 자신의 DayRecordLike, applyFixedRouteRun이 만드는 { fixedRouteCounts } 리터럴)가
// 전부 이미 Record<string, number>|undefined로 정확히 타입돼 있어서, unknown으로
// 받을 이유가 없다 — 그 정확한 타입을 그대로 쓴다. 아래 런타임 방어(typeof/
// Array.isArray)는 hydrate로 들어온 값처럼 실제로 형태가 어긋날 수 있는 데이터에
// 대한 방어라 타입을 좁혀도 그대로 남긴다.
/** @param {{ fixedRouteCounts?: Record<string, number> }|null|undefined} record */
export function getFixedRouteCounts(record) {
  const counts = record?.fixedRouteCounts
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return {}
  /** @type {Record<string, number>} */
  const next = {}
  Object.entries(counts).forEach(([routeId, value]) => {
    const n = parseInt(String(value), 10) || 0
    if (n > 0) next[routeId] = n
  })
  return next
}

/** @param {Record<string, number>|undefined} counts @param {string} routeId @param {number} delta */
export function applyFixedRouteRun(counts, routeId, delta) {
  const next = { ...getFixedRouteCounts({ fixedRouteCounts: counts }) }
  const value = Math.max(0, (next[routeId] || 0) + delta)
  if (value <= 0) delete next[routeId]
  else next[routeId] = value
  return next
}

/** @param {DayRecordLike|null|undefined} record */
export function isOffDay(record) {
  return !!record?.isOff
}

// id 유무는 신경 쓰지 않는다 — id가 항상 있어야 하는 유일한 소비자(day-log/ UI)는
// useDayDraft.js가 마운트 시 backfillCallDetailIds로 미리 채운 레코드만 넘긴다.
/** @param {DayRecordLike|null|undefined} record */
export function getCallDetails(record) {
  return Array.isArray(record?.callDetails) ? record.callDetails : []
}

// id 없는 레거시 콜상세를 "로드 시 정확히 한 번" 진짜 영구 id로 채운다(순수 계산만,
// 실제 store/localStorage 반영은 호출부가 원자적으로 한다). 이미 id가 있으면
// changed:false + 같은 참조(멱등). call-details.js의 buildCallDetail과 같은 접두어
// (`trp_`)를 쓰되, day-record.js→call-details.js 순환 참조를 피해 로컬로 만든다.
/** @param {DayRecordLike|undefined} record @returns {{ record: DayRecordLike|undefined, changed: boolean }} */
export function backfillCallDetailIds(record) {
  const list = Array.isArray(record?.callDetails) ? record.callDetails : []
  if (list.length === 0 || list.every((item) => item?.id)) return { record, changed: false }
  return {
    record: {
      ...record,
      callDetails: list.map((item) => (item?.id ? item : { ...item, id: `trp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` })),
    },
    changed: true,
  }
}

/** @param {DayRecordLike|null|undefined} record */
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

/** @param {DayRecordLike|null|undefined} record */
export function dayTripCount(record) {
  return getFixedCount(record) + countCallTrips(record)
}

/** @param {DayRecordLike|null|undefined} record */
export function callFareTotal(record) {
  if (!record || record.isOff) return 0
  return getCallDetails(record).reduce((sum, detail) => sum + parseCurrencyValue(detail.fare), 0)
}

/** @param {DayRecordLike|null|undefined} record */
export function callVatTotal(record) {
  if (!record || record.isOff) return 0
  return getCallDetails(record).reduce((sum, detail) => {
    const fare = parseCurrencyValue(detail.fare)
    return sum + (detail.vatExempt ? 0 : Math.round(fare * 0.1))
  }, 0)
}

/** @param {Record<string, DayRecordLike>} data @param {number} year @param {number} month @param {number|string} unitPrice */
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

/** @param {Record<string, DayRecordLike>} data @param {string} dateKey @param {{ isOff?: boolean, fixedCount?: number|string, callDetails?: Array<CallDetailLike>, fixedRouteCounts?: Record<string, number>, palletCount?: number|string }} [patch] @returns {Record<string, DayRecordLike>} */
export function saveDayRecord(data, dateKey, { isOff = false, fixedCount = 0, callDetails, fixedRouteCounts, palletCount } = {}) {
  const next = { ...data }
  const off = !!isOff
  const count = off ? 0 : Math.max(0, parseInt(String(fixedCount), 10) || 0)
  const prev = next[dateKey] || {}
  const details = Array.isArray(callDetails) ? callDetails : getCallDetails(prev)
  const routeCounts = getFixedRouteCounts({
    fixedRouteCounts: fixedRouteCounts !== undefined ? fixedRouteCounts : prev.fixedRouteCounts,
  })
  // palletCount도 파렛트 섹션이 꺼져 있으면 0으로 정규화(fixedCount와 같은 규칙,
  // "빈 날" 판정에도 반영).
  const pallets = off ? 0 : Math.max(0, parseInt(String(palletCount !== undefined ? palletCount : prev.palletCount), 10) || 0)

  if (!off && count === 0 && pallets === 0 && details.length === 0) {
    delete next[dateKey]
  } else {
    next[dateKey] = {
      ...prev,
      isOff: off,
      fixedCount: count,
      callDetails: details,
      fixedRouteCounts: routeCounts,
      palletCount: pallets,
    }
  }
  return next
}

/** @param {Record<string, DayRecordLike>} data @param {number} year @param {number} month */
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

/** @param {Record<string, DayRecordLike>} data @param {number} year @param {number} month */
export function monthWorkTotal(data, year, month) {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
  let total = 0
  for (const [key, record] of Object.entries(data)) {
    if (key.startsWith(prefix)) total += getFixedCount(record)
  }
  return total
}

// 하루치 뱃지 계산(dayFareTotal/dayWorkBadgeLabel/dayHasUnpaid)은 calendarBadges.js로.
