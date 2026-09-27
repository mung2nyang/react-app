// @ts-check
// 기사 정산 관련 월 지출 — 매출 손익 "기사 급여" 라인용. I/O 없음.
// getMonthlyDriverSalaryExpense와 반환 모양을 맞춘다.
import { getShortCarNum } from './cars.js'
import { getDriverIncomeDeductions, getDriverSettlementAmount } from './driverIncomeDeductions.js'
import {
  calculateDriverVehicleCommission,
  getDriverCarWorkData,
  getMonthlyDriverTotals,
} from './financeCore.js'

/** @typedef {import('./financeTypes.js').CarLike} CarLike */
/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('./financeTypes.js').WorkDataByLogId} WorkDataByLogId */

/**
 * 매출제 기사 월 정산액(기사 몫) — 기사 정산액 전체가 차주 지출이다. 산재 기사 몫·3.3%는 기사에게 줄 돈에서
 * 떼어 대신 내는 돈이라 지출이 아니고, 산재 차주 몫은 getMonthlyDriverInsuranceOwnerShare가 따로 더한다.
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
    const totals = getMonthlyDriverTotals(getDriverCarWorkData(car, workDataByLogId), monthKey, link, settings)
    const amount = calculateDriverVehicleCommission(car, totals.grossAmount, totals.count)
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

/**
 * 산재보험료 차주 부담분(월) — 기사 정산액(매출제 몫·월급제 월급) 기준. 산재 적용 토글이 꺼진 차량은 총액 전부가 차주 몫이다.
 * @param {string} monthKey
 * @param {FinanceSettings} settings
 * @param {Array<CarLike>} subCars
 * @param {WorkDataByLogId} [workDataByLogId]
 * @returns {{ total: number, items: Array<{ date: string, label: string, amount: number }> }}
 */
export function getMonthlyDriverInsuranceOwnerShare(monthKey, settings, subCars, workDataByLogId = {}) {
  const monthStart = `${monthKey}-01`
  const links = Array.isArray(settings?.driverLinks) ? settings.driverLinks : []
  /** @type {Array<{ date: string, label: string, amount: number }>} */
  const items = []
  let total = 0

  for (const car of subCars || []) {
    if (car.driverPayMode && car.driverPayMode !== 'salary' && car.driverPayMode !== 'revenue') continue

    const link = links.find((item) => item.id === car.driverLinkId || item.vehicleNumber === car.number) || null
    const totals = getMonthlyDriverTotals(getDriverCarWorkData(car, workDataByLogId), monthKey, link, settings)
    const commission = calculateDriverVehicleCommission(car, totals.grossAmount, totals.count)
    const amount = getDriverIncomeDeductions(car, getDriverSettlementAmount(car, commission)).insuranceOwnerShare
    if (amount <= 0) continue

    items.push({ date: monthStart, label: `${car.driverName || getShortCarNum(car.number)} 산재보험(차주 부담)`, amount })
    total += amount
  }

  return { total, items: items.sort((a, b) => a.date.localeCompare(b.date)) }
}
