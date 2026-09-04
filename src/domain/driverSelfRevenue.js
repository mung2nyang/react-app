// @ts-check
// 소속기사 본인 매출 손익 — 차주 OwnerMonthlyDetail과 같은 필드 모양,
// 값은 본인 정산 기준(지출 차감 없음). I/O 없음.
import { isVehicleRevenueSharedWithOwner } from './cars.js'
import { getMonthlyDriverRevenueShareExpense } from './driverRevenueShareExpense.js'
import { getMonthlyDriverSalaryExpense } from './financeCore.js'
import { getOwnerMonthlyFinanceDetail } from './financeOwnerDetail.js'

/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('./financeTypes.js').WorkDataByLogId} WorkDataByLogId */
/** @typedef {import('./financeTypes.js').CarLike} CarLike */

const EMPTY_BUCKET = { total: 0, items: /** @type {Array<{ date: string, label: string, amount: number }>} */ ([]) }

/**
 * @param {Array<CarLike>} subCars
 * @param {number} shareTotal
 * @param {number} salaryTotal
 */
function settlementLabel(subCars, shareTotal, salaryTotal) {
  if (salaryTotal > 0 && shareTotal <= 0) return '기사 정산(월급)'
  if (shareTotal > 0 && salaryTotal <= 0) {
    const revenueCars = subCars.filter((car) => car.driverPayMode !== 'salary')
    const rates = [...new Set(
      revenueCars
        .filter((car) => car.commType !== 'direct' && car.commission)
        .map((car) => String(car.commission).replace(/%/g, '').trim())
        .filter(Boolean),
    )]
    if (rates.length === 1) return `기사 정산(${rates[0]}%)`
  }
  return '기사 정산'
}

/**
 * @param {string} monthKey
 * @param {FinanceSettings} [settings]
 * @param {WorkDataByLogId} [workDataByLogId]
 */
export function getDriverSelfMonthlyDetail(monthKey, settings = {}, workDataByLogId = {}) {
  // 트립·운송료·거래처수수료·부가세·미입금은 기존 driver scope 집계를 재사용.
  // netProfit/income.total/expense는 아래 소속기사 의미로 덮어쓴다.
  const base = getOwnerMonthlyFinanceDetail(monthKey, 'driver', settings, workDataByLogId, [])
  const cars = Array.isArray(settings.cars) ? settings.cars : []
  const subCars = cars.filter((car) => car.type === 'sub' && isVehicleRevenueSharedWithOwner(car))
  const share = getMonthlyDriverRevenueShareExpense(monthKey, settings, subCars, workDataByLogId)
  const salary = getMonthlyDriverSalaryExpense(monthKey, settings, subCars)
  const settlementTotal = share.total + salary.total
  /** @type {{ total: number, items: Array<{ date: string, label: string, amount: number }>, label: string }} */
  const settlement = {
    total: settlementTotal,
    items: share.items.concat(salary.items).sort((a, b) => a.date.localeCompare(b.date)),
    label: settlementLabel(subCars, share.total, salary.total),
  }

  return {
    ...base,
    netProfit: settlementTotal,
    income: {
      fare: base.income.fare,
      commission: base.income.commission,
      fuelSubsidy: EMPTY_BUCKET,
      settlement,
      total: settlementTotal,
    },
    expense: {
      total: 0,
      maint: EMPTY_BUCKET,
      fuel: EMPTY_BUCKET,
      misc: EMPTY_BUCKET,
      salary: EMPTY_BUCKET,
    },
  }
}
