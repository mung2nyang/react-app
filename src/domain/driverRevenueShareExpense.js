// @ts-check
// 매출제(revenue-share %) 기사 월 정산액 — 매출 손익 "기사 급여" 라인용.
// getMonthlyDriverSalaryExpense와 반환 모양을 맞춘다. I/O 없음.
import { getShortCarNum } from './cars.js'
import {
  calculateDriverVehicleCommission,
  getDriverCarWorkData,
  getMonthlyDriverTotals,
} from './financeCore.js'

/** @typedef {import('./financeTypes.js').CarLike} CarLike */
/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('./financeTypes.js').WorkDataByLogId} WorkDataByLogId */

/**
 * @param {string} monthKey
 * @param {FinanceSettings} settings
 * @param {Array<CarLike>} subCars
 * @param {WorkDataByLogId} [workDataByLogId]
 * @returns {{ total: number, items: Array<{ date: string, label: string, amount: number }> }}
 */
export function getMonthlyDriverRevenueShareExpense(monthKey, settings, subCars, workDataByLogId = {}) {
  const monthStart = `${monthKey}-01`
  const links = Array.isArray(settings?.driverLinks) ? settings.driverLinks : []
  /** @type {Array<{ date: string, label: string, amount: number }>} */
  const items = []
  let total = 0

  for (const car of subCars || []) {
    // 월급제는 salary 함수가 담당. driverPayMode 미설정(레거시)은 매출제 기본값.
    if (car.driverPayMode === 'salary') continue
    if (car.driverPayMode && car.driverPayMode !== 'revenue') continue

    const link = links.find((item) => item.id === car.driverLinkId || item.vehicleNumber === car.number) || null
    const totals = getMonthlyDriverTotals(getDriverCarWorkData(car, workDataByLogId), monthKey, link)
    const commission = calculateDriverVehicleCommission(car, totals.grossAmount, totals.count)
    const insurance = car.insuranceOn ? totals.insuranceAmount : 0
    const amount = Math.max(0, commission - insurance)
    if (amount <= 0) continue

    items.push({
      date: monthStart,
      label: car.driverName || getShortCarNum(car.number),
      amount,
    })
    total += amount
  }

  return { total, items: items.sort((a, b) => a.date.localeCompare(b.date)) }
}
