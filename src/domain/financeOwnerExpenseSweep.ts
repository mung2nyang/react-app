// getOwnerMonthlyFinanceDetail의 비용(정비/주유/기타/유가보조금) sweep — owner expenses와 driverExpenses를 같은 규칙으로 나눈다.
import { parseCurrencyValue } from './money.ts'

export type ExpenseLike = { id?: string, kind: string, date: string, name?: string, category?: string, fuelType?: string, cost?: number, subsidy?: number, liters?: number | string, vehicleNumber?: string }
export type ExpenseLineItem = { date: string, label: string, amount: number }
export type ExpenseSweepBuckets = {
  maintItems: Array<ExpenseLineItem>
  fuelItems: Array<ExpenseLineItem>
  miscItems: Array<ExpenseLineItem>
  fuelSubsidyItems: Array<ExpenseLineItem>
  fuelSubsidyTotal: number
}

/** scope → 비용 소스. owner=expenses 중 표시 없음 / driver=driverExpenses + expenses 중 서브 표시 / all=둘 다. */
export function selectExpensesForScope(scope: string, expenses: Array<ExpenseLike> = [], driverExpenses: Array<ExpenseLike> = []): Array<ExpenseLike> {
  const ownerList = Array.isArray(expenses) ? expenses : []
  const driverList = Array.isArray(driverExpenses) ? driverExpenses : []
  // 차주 목록의 서브 표시 항목은 그 서브차량 비용 — 수입과 같이 "기사" 탭에 센다.
  const ownerSub = ownerList.filter((item) => String(item?.vehicleNumber || '').trim())
  if (scope === 'owner') return ownerList.filter((item) => !String(item?.vehicleNumber || '').trim())
  if (scope === 'driver') return driverList.concat(ownerSub)
  return ownerList.concat(driverList)
}

/** 기사 드롭다운 차량번호로 driverExpenses만 좁힌다. */
export function filterDriverExpensesByVehicle(driverExpenses: Array<ExpenseLike> = [], vehicleNumber?: string): Array<ExpenseLike> {
  const list = Array.isArray(driverExpenses) ? driverExpenses : []
  const want = String(vehicleNumber || '').trim()
  if (!want) return list
  return list.filter((item) => String(item?.vehicleNumber || '').trim() === want)
}

export function sweepExpenseItems(monthKey: string, items: Array<ExpenseLike> = []): ExpenseSweepBuckets {
  const maintItems: Array<ExpenseLineItem> = []
  const fuelItems: Array<ExpenseLineItem> = []
  const miscItems: Array<ExpenseLineItem> = []
  const fuelSubsidyItems: Array<ExpenseLineItem> = []
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

  const sortByDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date)
  maintItems.sort(sortByDate)
  fuelItems.sort(sortByDate)
  miscItems.sort(sortByDate)
  fuelSubsidyItems.sort(sortByDate)

  return { maintItems, fuelItems, miscItems, fuelSubsidyItems, fuelSubsidyTotal }
}
