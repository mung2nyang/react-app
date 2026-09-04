// @ts-check
// getOwnerMonthlyFinanceDetail의 비용(정비/주유/기타/유가보조금) sweep.
// scope별 소스 선택 + monthKey·kind별 bucket — owner expenses와 driverExpenses를
// 동일 규칙으로 처리한다(subsidy 특수 케이스 없음).
import { parseCurrencyValue } from './money.js'

/** @typedef {{ id?: string, kind: string, date: string, name?: string, category?: string, fuelType?: string, cost?: number, subsidy?: number, liters?: number|string, vehicleNumber?: string }} ExpenseLike */
/** @typedef {{ date: string, label: string, amount: number }} ExpenseLineItem */
/**
 * @typedef {Object} ExpenseSweepBuckets
 * @property {Array<ExpenseLineItem>} maintItems
 * @property {Array<ExpenseLineItem>} fuelItems
 * @property {Array<ExpenseLineItem>} miscItems
 * @property {Array<ExpenseLineItem>} fuelSubsidyItems
 * @property {number} fuelSubsidyTotal
 */

/**
 * scope → 비용 소스. owner=expenses / driver=driverExpenses / all=둘 다.
 * @param {string} scope
 * @param {Array<ExpenseLike>} [expenses]
 * @param {Array<ExpenseLike>} [driverExpenses]
 * @returns {Array<ExpenseLike>}
 */
export function selectExpensesForScope(scope, expenses = [], driverExpenses = []) {
  const ownerList = Array.isArray(expenses) ? expenses : []
  const driverList = Array.isArray(driverExpenses) ? driverExpenses : []
  if (scope === 'owner') return ownerList
  if (scope === 'driver') return driverList
  return ownerList.concat(driverList)
}

/**
 * 기사 드롭다운 차량번호로 driverExpenses만 좁힌다.
 * @param {Array<ExpenseLike>} [driverExpenses]
 * @param {string} [vehicleNumber]
 * @returns {Array<ExpenseLike>}
 */
export function filterDriverExpensesByVehicle(driverExpenses = [], vehicleNumber) {
  const list = Array.isArray(driverExpenses) ? driverExpenses : []
  const want = String(vehicleNumber || '').trim()
  if (!want) return list
  return list.filter((item) => String(item?.vehicleNumber || '').trim() === want)
}

/**
 * @param {string} monthKey
 * @param {Array<ExpenseLike>} [items]
 * @returns {ExpenseSweepBuckets}
 */
export function sweepExpenseItems(monthKey, items = []) {
  /** @type {Array<ExpenseLineItem>} */
  const maintItems = []
  /** @type {Array<ExpenseLineItem>} */
  const fuelItems = []
  /** @type {Array<ExpenseLineItem>} */
  const miscItems = []
  /** @type {Array<ExpenseLineItem>} */
  const fuelSubsidyItems = []
  let fuelSubsidyTotal = 0

  ;(Array.isArray(items) ? items : []).forEach((item) => {
    const date = String(item?.date || '')
    if (!date.startsWith(monthKey)) return
    if (item.kind === 'maint') {
      maintItems.push({ date, label: item.name || item.category || '정비', amount: parseCurrencyValue(item.cost) })
    } else if (item.kind === 'fuel') {
      const cost = parseCurrencyValue(item.cost)
      const subsidy = parseCurrencyValue(item.subsidy)
      fuelItems.push({ date, label: `${item.fuelType || '주유'}${item.liters ? ` ${item.liters}L` : ''}`, amount: cost })
      if (subsidy > 0) {
        fuelSubsidyItems.push({ date, label: item.fuelType || '주유', amount: subsidy })
        fuelSubsidyTotal += subsidy
      }
    } else if (item.kind === 'misc') {
      miscItems.push({ date, label: item.name || item.category || '기타', amount: parseCurrencyValue(item.cost) })
    }
  })

  /** @param {{date: string}} a @param {{date: string}} b */
  const sortByDate = (a, b) => a.date.localeCompare(b.date)
  maintItems.sort(sortByDate)
  fuelItems.sort(sortByDate)
  miscItems.sort(sortByDate)
  fuelSubsidyItems.sort(sortByDate)

  return { maintItems, fuelItems, miscItems, fuelSubsidyItems, fuelSubsidyTotal }
}
