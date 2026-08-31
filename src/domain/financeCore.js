// @ts-check
// finance.js(647줄)를 쪼갠 조각 중 하나. 결제 요약·수수료·기사 정산 총계 같은
// 기본 순수 계산과 getMonthlyFareRevenue(달력/월 매출 합계)만 담는다. 나머지는
// financeReceivables.js/financeOwnerDetail.js/financeTaxInvoiceGroups.js/
// financeTaxInvoiceEntries.js로 나눴고, finance.js는 이 5개를 재수출하는 배럴만
// 남았다 — 기존 `from './finance.js'` 참조는 한 곳도 안 고쳐도 된다.
import {
  getEffectiveDriverSettlementMode,
  getShortCarNum,
  isVehicleRevenueSharedWithOwner,
} from './cars.js'
import { getFixedRouteClient, resolveFixedUnitPrice } from './clients.js'
import { isDateWithinAssignment } from './drivers.js'
import { parseCurrencyValue } from './money.js'

/** @typedef {import('./callDetail.js').CallDetailLike} CallDetailLike */
/** @typedef {import('./financeTypes.js').CarLike} CarLike */
/** @typedef {import('./financeTypes.js').DriverLinkLike} DriverLinkLike */
/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('./financeTypes.js').WorkDataByLogId} WorkDataByLogId */
/** @typedef {import('./day-record.js').DayRecordLike} DayRecordLike */

/** @param {WorkDataByLogId} workDataByLogId @param {string} logId */
export function logData(workDataByLogId, logId) {
  if (!workDataByLogId) return {}
  return workDataByLogId[logId] || {}
}

/** @param {CarLike} car @param {WorkDataByLogId} workDataByLogId */
export function getDriverCarWorkData(car, workDataByLogId) {
  return logData(workDataByLogId, car?.number)
}

/** @param {CallDetailLike} detail */
export function getDetailPaymentSummary(detail) {
  const fare = parseCurrencyValue(detail?.fare)

  if (!Array.isArray(detail?.payments)) {
    const legacyPaid = (detail?.paymentStatus || '미수') !== '미수'
    return {
      paidAmount: legacyPaid ? fare : 0,
      remainingAmount: legacyPaid ? 0 : fare,
      status: /** @type {'paid'|'unpaid'} */ (legacyPaid ? 'paid' : 'unpaid'),
    }
  }

  const paidAmount = detail.payments.reduce((sum, payment) => sum + (parseCurrencyValue(payment.amount) || 0), 0)
  const remainingAmount = Math.max(fare - paidAmount, 0)
  /** @type {'paid'|'partial'|'unpaid'} */
  let status = 'unpaid'
  if (paidAmount > 0 && remainingAmount > 0) status = 'partial'
  else if (paidAmount > 0 && remainingAmount <= 0) status = 'paid'

  return { paidAmount, remainingAmount, status }
}

/** @param {CallDetailLike} detail */
export function syncDetailPaymentStatus(detail) {
  const summary = getDetailPaymentSummary(detail)
  detail.paymentStatus = summary.status === 'paid' ? '수금 완료' : '미수'
  return summary
}

/** @param {CallDetailLike} detail */
export function getCallDetailDurationMinutes(detail) {
  const dep = detail?.departureTime
  const arr = detail?.arrivalTime
  if (!dep || !arr) return 0
  const [sh, sm] = dep.split(':').map(Number)
  const [eh, em] = arr.split(':').map(Number)
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0
  let minutes = (eh * 60 + em) - (sh * 60 + sm)
  if (minutes < 0) minutes += 1440
  return minutes
}

/** @param {CallDetailLike} detail @param {number} fare @param {FinanceSettings} settings */
export function getCallDetailCommissionAmount(detail, fare, settings) {
  const snapshot = detail?.commissionSnapshot
  let enabled
  let type
  let value
  if (snapshot) {
    enabled = snapshot.enabled
    type = snapshot.type
    value = snapshot.value
  } else {
    const client = (settings.clients || []).find((c) => c.companyName === detail?.client)
    enabled = !!client?.commEnabled
    type = client?.commType
    value = client?.commValue
  }
  if (!enabled) return 0
  return type === 'direct' ? parseCurrencyValue(value) : Math.floor(fare * (parseFloat(String(value)) || 0) / 100)
}

/** @param {Record<string, DayRecordLike>} data @param {string} monthKey @param {DriverLinkLike|null} [link] */
export function getMonthlyDriverTotals(data, monthKey, link = null) {
  let grossAmount = 0
  let insuranceAmount = 0
  let count = 0
  Object.entries(data || {}).forEach(([dateKey, record]) => {
    if (!dateKey.startsWith(monthKey) || !record || typeof record !== 'object') return
    if (!isDateWithinAssignment(dateKey, link?.assignmentStart, link?.assignmentEnd)) return
    const details = Array.isArray(record.callDetails) ? record.callDetails : []
    details.forEach((detail) => {
      const workDate = detail.workDate || dateKey
      if (!workDate.startsWith(monthKey)) return
      if (!isDateWithinAssignment(workDate, link?.assignmentStart, link?.assignmentEnd)) return
      grossAmount += parseCurrencyValue(detail.fare)
      insuranceAmount += parseCurrencyValue(/** @type {{insuranceFee?: string|number}} */ (detail).insuranceFee)
      count += 1
    })
    const fixedFare = parseCurrencyValue(record.fare || record.fixedFare || record.totalFare)
    if (fixedFare > 0) grossAmount += fixedFare
    count += Number(record.fixedCount || record.count || 0)
  })
  return { grossAmount, insuranceAmount, count }
}

/** @param {CarLike} car @param {number} grossAmount @param {number} count */
export function calculateDriverVehicleCommission(car, grossAmount, count) {
  if (!car?.commEnabled || !car.commission) return 0
  const tripCount = Number(count) || 0
  if (car.commType === 'direct') return tripCount > 0 ? parseCurrencyValue(car.commission) * tripCount : 0
  return Math.floor(grossAmount * (parseFloat(String(car.commission)) || 0) / 100)
}

/** @param {string} monthKey @param {FinanceSettings} [settings] @param {WorkDataByLogId} [workDataByLogId] */
export function getMonthlyFareRevenue(monthKey, settings = {}, workDataByLogId = {}) {
  const cars = Array.isArray(settings.cars) ? settings.cars : []

  const sources = [{ logId: 'main', label: '메인 차량', data: logData(workDataByLogId, 'main') }]
  cars.filter((car) => car.type === 'sub' && isVehicleRevenueSharedWithOwner(car)).forEach((car) => {
    const mode = getEffectiveDriverSettlementMode(car, settings)
    if (mode === 'company' || mode === 'employee') {
      sources.push({ logId: car.number, label: getShortCarNum(car.number), data: getDriverCarWorkData(car, workDataByLogId) })
    }
  })

  let totalFare = 0
  let tripCount = 0
  /** @type {Array<{ logId: string, label: string, fare: number, tripCount: number }>} */
  const byVehicle = []

  const fixedRouteClientForTotals = getFixedRouteClient(settings)
  sources.forEach((source) => {
    const isMain = source.logId === 'main'
    const activeFixedOn = isMain ? settings.fixedOn : settings.subFixedOn
    const activePalletOn = !!fixedRouteClientForTotals?.palletOn
    // 달력·매출 단가는 고정노선 연결 거래처 fixedUnitPrice만 (resolveFixedUnitPrice).
    const fixedUnitPrice = resolveFixedUnitPrice(settings)
    const palletUnitPrice = parseCurrencyValue(fixedRouteClientForTotals?.palletPrice)

    let vehicleFare = 0
    let vehicleCount = 0

    Object.entries(source.data || {}).forEach(([dateKey, record]) => {
      if (!dateKey.startsWith(monthKey) || !record || typeof record !== 'object' || record.isOff) return

      if (Number(record.fixedCount) > 0) {
        vehicleCount += parseInt(String(record.fixedCount), 10) || 0
        vehicleFare += (Number(record.fixedCount) || 0) * fixedUnitPrice
      }
      if (Number(record.palletCount) > 0 && activeFixedOn && activePalletOn) {
        vehicleFare += (Number(record.palletCount) || 0) * palletUnitPrice
      }

      ;(Array.isArray(record.callDetails) ? record.callDetails : []).forEach((detail) => {
        const type = detail?.distanceType || ''
        if (type === '공차') {
          // 0회 처리
        } else if (type === '혼짐') {
          if (detail.linkedLoadIndex === 'pending' || detail.linkedLoadIndex === '-1' || detail.linkedLoadIndex === undefined) {
            vehicleCount += 1
          }
        } else {
          vehicleCount += 1
        }

        const gross = parseCurrencyValue(detail?.fare)
        vehicleFare += gross
      })
    })

    totalFare += vehicleFare
    tripCount += vehicleCount
    byVehicle.push({ logId: source.logId, label: source.label, fare: vehicleFare, tripCount: vehicleCount })
  })

  return { totalFare, tripCount, byVehicle }
}
