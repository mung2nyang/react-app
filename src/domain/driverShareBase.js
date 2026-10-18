// @ts-check
// 매출제 기사 몫의 기준 금액 — 차량마다 "운송료 전체"(기본) 또는 "거래처 수수료 뗀 뒤"(로드맵 61, 보리 결정 2026-10-18).
// 달력·매출 기사 급여·기사 관리 정산·연동 기사 본인 매출이 모두 이 함수로 기준 금액을 받는다.
import { getFixedRouteClient, resolveFixedUnitPrice } from './clients.js'
import { getCallDetails, getFixedCount } from './day-record.js'
import { isDateWithinAssignment } from './drivers.js'
import { getCallDetailCommissionAmount } from './financeCore.js'
import { getFixedRouteCommissionAmount } from './fixedRouteCommission.js'
import { parseCurrencyValue } from './money.js'

/** @typedef {import('./financeTypes.js').CarLike} CarLike */
/** @typedef {import('./financeTypes.js').DriverLinkLike} DriverLinkLike */
/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('./day-record.js').DayRecordLike} DayRecordLike */

export const DRIVER_SHARE_BASES = /** @type {const} */ (['gross', 'afterClientCommission'])

/** 차량에 정한 기준. 없거나 모르는 값이면 운송료 전체. @param {CarLike|null|undefined} car @returns {'gross'|'afterClientCommission'} */
export function resolveDriverShareBase(car) {
  return car?.driverShareBase === 'afterClientCommission' ? 'afterClientCommission' : 'gross'
}

/**
 * 기사 몫을 계산할 금액 — 기준이 "뗀 뒤"면 운송료에서 같은 운행들의 거래처 수수료를 뺀다.
 * @param {CarLike|null|undefined} car @param {number} grossAmount @param {number} clientCommission
 */
export function driverShareBaseAmount(car, grossAmount, clientCommission) {
  return resolveDriverShareBase(car) === 'afterClientCommission' ? grossAmount - clientCommission : grossAmount
}

/**
 * 그달 계약 기간 안 운행의 거래처 수수료 합(콜 상세 + 고정노선) — getMonthlyDriverTotals와 같은 날짜·기간 거르기.
 * @param {Record<string, DayRecordLike>|null|undefined} data
 * @param {string} monthKey
 * @param {DriverLinkLike|null} [link]
 * @param {FinanceSettings} [settings]
 */
export function getMonthlyDriverClientCommission(data, monthKey, link = null, settings = {}) {
  const fixedRouteClient = getFixedRouteClient(settings, link?.vehicleNumber)
  const fixedUnitPrice = resolveFixedUnitPrice(settings, link?.vehicleNumber)
  let total = 0
  Object.entries(data || {}).forEach(([dateKey, record]) => {
    if (!dateKey.startsWith(monthKey) || !record || typeof record !== 'object' || record.isOff) return
    if (!isDateWithinAssignment(dateKey, link?.assignmentStart, link?.assignmentEnd)) return
    getCallDetails(record).forEach((detail) => {
      const workDate = detail.workDate || dateKey
      if (!workDate.startsWith(monthKey) || !isDateWithinAssignment(workDate, link?.assignmentStart, link?.assignmentEnd)) return
      total += getCallDetailCommissionAmount(detail, parseCurrencyValue(detail.fare), settings)
    })
    const fixedCount = getFixedCount(record)
    if (fixedCount > 0) total += getFixedRouteCommissionAmount(fixedRouteClient, fixedCount * fixedUnitPrice, fixedCount)
  })
  return total
}
