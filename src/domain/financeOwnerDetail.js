// @ts-check
// 재감사 2차(FAIL 지적) — finance.js를 200줄 이하로 실제로 쪼갠 조각. 오너/기사
// 월별 손익 상세(getOwnerMonthlyFinanceDetail) 하나만 담는다 — 원래 finance.js에서
// 가장 큰(약 150줄) 단일 함수였다.
// 재감사 3차(FAIL 지적 4번) — @ts-check 적용. 이 함수의 반환 모양은
// components/revenue/OwnerMonthlyCards.jsx가 ReturnType으로 그대로 참조하므로,
// 필드 이름·구조를 바꾸면 그쪽도 같이 깨진다(타입 체크가 잡아 준다).
import { getShortCarNum, isVehicleRevenueSharedWithOwner } from './cars.js'
import { getFixedRouteClient, resolveFixedUnitPrice } from './clients.js'
import { parseCurrencyValue } from './money.js'
import {
  getCallDetailCommissionAmount, getCallDetailDurationMinutes, getDriverCarWorkData,
  getMonthlyDriverSalaryExpense, logData,
} from './financeCore.js'
import { getMonthlyDriverRevenueShareExpense } from './driverRevenueShareExpense.js'
import { getReceivableItems } from './financeReceivables.js'
import { selectExpensesForScope, sweepExpenseItems } from './financeOwnerExpenseSweep.js'

/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('./financeTypes.js').WorkDataByLogId} WorkDataByLogId */
/** @typedef {import('./financeOwnerExpenseSweep.js').ExpenseLike} ExpenseLike */

// 비용(정비/주유/기타/유가보조금)은 financeOwnerExpenseSweep이 담당한다.
// expenses[ownerKey] = 차주 본인(메인 차량 hydrate) → scope owner·all.
// driverExpenses[ownerKey] = 서브(기사) 차량 읽기전용 → scope driver·all.
// 두 버킷을 섞지 않는다(Q3). record.maintItems/fuelItems/miscItems는 읽지 않는다.
/**
 * @param {string} monthKey
 * @param {string} scope
 * @param {FinanceSettings} [settings]
 * @param {WorkDataByLogId} [workDataByLogId]
 * @param {Array<ExpenseLike>} [expenses]
 * @param {Array<ExpenseLike>} [driverExpenses]
 */
export function getOwnerMonthlyFinanceDetail(monthKey, scope = 'owner', settings = {}, workDataByLogId = {}, expenses = [], driverExpenses = []) {
  const cars = Array.isArray(settings.cars) ? settings.cars : []
  const subCarsInScope = cars.filter((car) => car.type === 'sub' && isVehicleRevenueSharedWithOwner(car))

  /** @type {Array<{ logId: string, label: string, data: Record<string, import('./day-record.js').DayRecordLike> }>} */
  const sources = []
  if (scope !== 'driver') sources.push({ logId: 'main', label: '메인 차량', data: logData(workDataByLogId, 'main') })
  if (scope !== 'owner') {
    subCarsInScope.forEach((car) => {
      sources.push({ logId: car.number, label: getShortCarNum(car.number), data: getDriverCarWorkData(car, workDataByLogId) })
    })
  }

  const fixedRouteClientForTotals = getFixedRouteClient(settings)
  const fixedClientLabel = fixedRouteClientForTotals?.companyName || '고정노선'

  let tripCount = 0
  let distanceKm = 0
  let durationMinutes = 0
  let vatAmount = 0

  /** @type {Map<string, number>} */
  const fareByClient = new Map()
  /** @type {Map<string, number>} */
  const commissionByClient = new Map()

  sources.forEach((source) => {
    const isMain = source.logId === 'main'
    const activeFixedOn = isMain ? settings.fixedOn : settings.subFixedOn
    const activePalletOn = !!fixedRouteClientForTotals?.palletOn
    const fixedUnitPrice = resolveFixedUnitPrice(settings)
    const palletUnitPrice = parseCurrencyValue(fixedRouteClientForTotals?.palletPrice)

    Object.entries(source.data || {}).forEach(([dateKey, record]) => {
      if (!dateKey.startsWith(monthKey) || !record || typeof record !== 'object') return

      if (!record.isOff) {
        if (Number(record.fixedCount) > 0) {
          const count = Number(record.fixedCount) || 0
          tripCount += count
          const amount = count * fixedUnitPrice
          fareByClient.set(fixedClientLabel, (fareByClient.get(fixedClientLabel) || 0) + amount)
          vatAmount += Math.round(amount * 0.1)
        }
        if (Number(record.palletCount) > 0 && activeFixedOn && activePalletOn) {
          const amount = (Number(record.palletCount) || 0) * palletUnitPrice
          fareByClient.set(fixedClientLabel, (fareByClient.get(fixedClientLabel) || 0) + amount)
          vatAmount += Math.round(amount * 0.1)
        }

        ;(Array.isArray(record.callDetails) ? record.callDetails : []).forEach((detail) => {
          const type = detail?.distanceType || ''
          if (type === '공차') {
            // 0회 처리
          } else if (type === '혼짐') {
            if (detail.linkedLoadIndex === 'pending' || detail.linkedLoadIndex === '-1' || detail.linkedLoadIndex === undefined) tripCount += 1
          } else {
            tripCount += 1
          }

          const fare = parseCurrencyValue(detail?.fare)
          const clientLabel = detail?.client || '미지정 거래처'
          fareByClient.set(clientLabel, (fareByClient.get(clientLabel) || 0) + fare)

          if (!detail?.vatExempt) vatAmount += Math.round(fare * 0.1)

          const commission = getCallDetailCommissionAmount(detail, fare, settings)
          if (commission > 0) commissionByClient.set(clientLabel, (commissionByClient.get(clientLabel) || 0) + commission)

          distanceKm += parseCurrencyValue(detail?.distanceKm)
          durationMinutes += getCallDetailDurationMinutes(detail)
        })
      }
    })
  })

  const {
    maintItems, fuelItems, miscItems, fuelSubsidyItems, fuelSubsidyTotal,
  } = sweepExpenseItems(monthKey, selectExpensesForScope(scope, expenses, driverExpenses))

  const salaryPart = scope !== 'owner' ? getMonthlyDriverSalaryExpense(monthKey, settings, subCarsInScope) : null
  const sharePart = scope !== 'owner' ? getMonthlyDriverRevenueShareExpense(monthKey, settings, subCarsInScope, workDataByLogId) : null
  const salaryTotal = (salaryPart?.total || 0) + (sharePart?.total || 0)
  const salaryItems = (salaryPart?.items || []).concat(sharePart?.items || []).sort((a, b) => a.date.localeCompare(b.date))

  const fareItems = Array.from(fareByClient.entries()).map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount)
  const commissionItems = Array.from(commissionByClient.entries()).map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount)

  const fareTotal = fareItems.reduce((sum, i) => sum + i.amount, 0)
  const commissionTotal = commissionItems.reduce((sum, i) => sum + i.amount, 0)
  const maintTotal = maintItems.reduce((sum, i) => sum + i.amount, 0)
  const fuelTotal = fuelItems.reduce((sum, i) => sum + i.amount, 0)
  const miscTotal = miscItems.reduce((sum, i) => sum + i.amount, 0)

  const incomeTotal = fareTotal - commissionTotal + fuelSubsidyTotal
  const expenseTotal = maintTotal + fuelTotal + miscTotal + salaryTotal

  const unpaidItems = getReceivableItems(settings, workDataByLogId).filter((item) => {
    if (!item.workDate.startsWith(monthKey) || item.remainingAmount <= 0) return false
    if (scope === 'owner') return item.logId === 'main'
    if (scope === 'driver') return item.logId !== 'main'
    return true
  })
  const unpaidTotal = unpaidItems.reduce((sum, i) => sum + i.remainingAmount, 0)

  return {
    monthKey,
    tripCount,
    distanceKm: Math.round(distanceKm),
    durationHours: Math.round(durationMinutes / 60),
    vatAmount,
    netProfit: incomeTotal - expenseTotal,
    income: {
      total: incomeTotal,
      fare: { total: fareTotal, items: fareItems },
      commission: { total: commissionTotal, items: commissionItems },
      fuelSubsidy: { total: fuelSubsidyTotal, items: fuelSubsidyItems },
    },
    expense: {
      total: expenseTotal,
      maint: { total: maintTotal, items: maintItems },
      fuel: { total: fuelTotal, items: fuelItems },
      misc: { total: miscTotal, items: miscItems },
      salary: { total: salaryTotal, items: salaryItems },
    },
    unpaid: { total: unpaidTotal, count: unpaidItems.length, items: unpaidItems },
  }
}
