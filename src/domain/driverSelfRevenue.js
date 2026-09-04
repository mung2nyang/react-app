// @ts-check
// 소속기사 본인 매출 손익 — workLogs.main 전제(택 A + §6-J).
// base = getOwnerMonthlyFinanceDetail(owner scope) → main 만 읽음.
// 정산액 = fare.total·tripCount 기준 commission − 산재(totals, link=null).
// 지출 카드는 expenses 로 채우되 netProfit 은 정산액 유지(Q1).
import { getShortCarNum, isVehicleRevenueSharedWithOwner } from './cars.js'
import {
  calculateDriverVehicleCommission,
  getMonthlyDriverTotals,
  logData,
} from './financeCore.js'
import { getOwnerMonthlyFinanceDetail } from './financeOwnerDetail.js'
import { parseCurrencyValue } from './money.js'

/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('./financeTypes.js').WorkDataByLogId} WorkDataByLogId */
/** @typedef {import('./financeTypes.js').CarLike} CarLike */
/** @typedef {import('./expenseTypes.js').ExpenseItem} ExpenseItem */

const EMPTY_BUCKET = { total: 0, items: /** @type {Array<{ date: string, label: string, amount: number }>} */ ([]) }

/**
 * @param {CarLike} car
 * @param {number} shareAmount
 */
function settlementLabelForCar(car, shareAmount) {
  if (car.driverPayMode === 'salary') return '기사 정산(월급)'
  if (shareAmount > 0 && car.commType !== 'direct' && car.commission) {
    const rate = String(car.commission).replace(/%/g, '').trim()
    if (rate) return `기사 정산(${rate}%)`
  }
  return '기사 정산'
}

/**
 * @param {FinanceSettings} settings
 * @returns {CarLike|null}
 */
function firstAssignedSubCar(settings) {
  const cars = Array.isArray(settings.cars) ? settings.cars : []
  const shared = cars.filter((car) => car.type === 'sub' && isVehicleRevenueSharedWithOwner(car))
  return shared[0] || null
}

/**
 * @param {string} monthKey
 * @param {FinanceSettings} [settings]
 * @param {WorkDataByLogId} [workDataByLogId]
 * @param {Array<ExpenseItem>} [expenses]
 */
export function getDriverSelfMonthlyDetail(monthKey, settings = {}, workDataByLogId = {}, expenses = []) {
  const base = getOwnerMonthlyFinanceDetail(monthKey, 'owner', settings, workDataByLogId, expenses)
  const assigned = firstAssignedSubCar(settings)
  const monthStart = `${monthKey}-01`

  let settlementTotal = 0
  let label = '기사 정산'
  /** @type {Array<{ date: string, label: string, amount: number }>} */
  let items = []

  if (assigned) {
    if (assigned.driverPayMode === 'salary') {
      settlementTotal = parseCurrencyValue(assigned.driverSalaryAmount)
    } else {
      const commission = calculateDriverVehicleCommission(
        assigned,
        base.income.fare.total,
        base.tripCount,
      )
      const totals = getMonthlyDriverTotals(logData(workDataByLogId, 'main'), monthKey, null)
      const insurance = assigned.insuranceOn ? totals.insuranceAmount : 0
      settlementTotal = Math.max(0, commission - insurance)
    }
    label = settlementLabelForCar(assigned, settlementTotal)
    if (settlementTotal > 0) {
      items = [{
        date: monthStart,
        label: assigned.driverName || getShortCarNum(assigned.number),
        amount: settlementTotal,
      }]
    }
  }

  return {
    ...base,
    netProfit: settlementTotal,
    income: {
      fare: base.income.fare,
      commission: base.income.commission,
      fuelSubsidy: EMPTY_BUCKET,
      settlement: { total: settlementTotal, items, label },
      total: settlementTotal,
    },
    expense: base.expense,
  }
}
