// 오너/기사 월별 손익 상세(getOwnerMonthlyFinanceDetail) — 반환 모양을 features/revenue/ui/OwnerMonthlyCards.jsx가 ReturnType으로 참조한다.
import { getShortCarNum, isVehicleRevenueSharedWithOwner } from './cars.ts'
import { getFixedRouteClient, resolveFixedUnitPrice } from './clients.ts'
import { parseCurrencyValue, vatOf } from './money.ts'
import {
  getCallDetailCommissionAmount, getCallDetailDurationMinutes, getDriverCarWorkData,
  getMonthlyDriverSalaryExpense, logData,
} from './financeCore.ts'
import { getMonthlyDriverInsuranceOwnerShare, getMonthlyDriverRevenueShareExpense } from './driverRevenueShareExpense.ts'
import { getReceivableItems } from './financeReceivables.ts'
import { getFixedRouteCommissionAmount } from './fixedRouteCommission.ts'
import { selectExpensesForScope, sweepExpenseItems } from './financeOwnerExpenseSweep.ts'
import type { FinanceSettings, WorkDataByLogId } from './financeTypes.ts'
import type { ExpenseLike } from './financeOwnerExpenseSweep.ts'
import { getRecordTotalDistance, type DayRecordLike } from './day-record.ts'

// 비용은 financeOwnerExpenseSweep이 맡는다 — expenses(차주 본인)와 driverExpenses(기사 차량)를 섞지 않고 record의 비용 필드는 읽지 않는다(Q3).
/** @param mainFixedScopeKey 메인 소스의 고정노선 스코프 키 — 연동기사 본인 세션(일지는 main, 거래처는 배정 차량 스코프)만 넘긴다 */
export function getOwnerMonthlyFinanceDetail(monthKey: string, scope = 'owner', settings: FinanceSettings = {}, workDataByLogId: WorkDataByLogId = {}, expenses: Array<ExpenseLike> = [], driverExpenses: Array<ExpenseLike> = [], mainFixedScopeKey = '') {
  const cars = Array.isArray(settings.cars) ? settings.cars : []
  const subCarsInScope = cars.filter((car) => car.type === 'sub' && isVehicleRevenueSharedWithOwner(car))

  const sources: Array<{ logId: string, label: string, data: Record<string, DayRecordLike> }> = []
  if (scope !== 'driver') sources.push({ logId: 'main', label: '메인 차량', data: logData(workDataByLogId, 'main') })
  if (scope !== 'owner') {
    subCarsInScope.forEach((car) => {
      sources.push({ logId: car.number, label: getShortCarNum(car.number), data: getDriverCarWorkData(car, workDataByLogId) })
    })
  }

  let tripCount = 0
  let distanceKm = 0
  let durationMinutes = 0
  let vatAmount = 0

  const fareByClient = new Map<string, number>()
  const commissionByClient = new Map<string, number>()
  const insuranceByClient = new Map<string, number>()

  sources.forEach((source) => {
    const isMain = source.logId === 'main'
    const activeFixedOn = isMain ? settings.fixedOn : settings.subFixedOn
    // 소스(차량)별 스코프 고정노선 우선, 없으면 차주 것 fallback(getFixedRouteClient).
    const fixedScopeKey = isMain && mainFixedScopeKey ? mainFixedScopeKey : source.logId
    const fixedRouteClientForTotals = getFixedRouteClient(settings, fixedScopeKey)
    const fixedClientLabel = fixedRouteClientForTotals?.companyName || '고정 노선'
    const activePalletOn = !!fixedRouteClientForTotals?.palletOn
    const fixedUnitPrice = resolveFixedUnitPrice(settings, fixedScopeKey)
    const palletUnitPrice = parseCurrencyValue(fixedRouteClientForTotals?.palletPrice)

    Object.entries(source.data || {}).forEach(([dateKey, record]) => {
      if (!dateKey.startsWith(monthKey) || !record || typeof record !== 'object') return

      if (!record.isOff) {
        distanceKm += getRecordTotalDistance(record)
        if (Number(record.fixedCount) > 0) {
          const count = Number(record.fixedCount) || 0
          tripCount += count
          const amount = count * fixedUnitPrice
          fareByClient.set(fixedClientLabel, (fareByClient.get(fixedClientLabel) || 0) + amount)
          vatAmount += vatOf(amount)
          // 고정노선도 거래처 수수료를 뗀다(달력 monthSettlement와 같은 함수, 로드맵 39).
          const fixedComm = getFixedRouteCommissionAmount(fixedRouteClientForTotals, amount, count)
          if (fixedComm > 0) commissionByClient.set(fixedClientLabel, (commissionByClient.get(fixedClientLabel) || 0) + fixedComm)
        }
        if (Number(record.palletCount) > 0 && activeFixedOn && activePalletOn) {
          const amount = (Number(record.palletCount) || 0) * palletUnitPrice
          fareByClient.set(fixedClientLabel, (fareByClient.get(fixedClientLabel) || 0) + amount)
          vatAmount += vatOf(amount)
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

          if (!detail?.vatExempt) vatAmount += vatOf(fare)

          const commission = getCallDetailCommissionAmount(detail, fare, settings)
          if (commission > 0) commissionByClient.set(clientLabel, (commissionByClient.get(clientLabel) || 0) + commission)

          // 콜 상세 산재보험료는 수입에서 뺀다(로드맵 40, 달력 callInsuranceTotal과 같은 값).
          const insurance = parseCurrencyValue(detail?.insuranceFee)
          if (insurance > 0) insuranceByClient.set(clientLabel, (insuranceByClient.get(clientLabel) || 0) + insurance)

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
  const insurancePart = scope !== 'owner' ? getMonthlyDriverInsuranceOwnerShare(monthKey, settings, subCarsInScope, workDataByLogId) : null
  const salaryTotal = (salaryPart?.total || 0) + (sharePart?.total || 0) + (insurancePart?.total || 0)
  const salaryItems = (salaryPart?.items || []).concat(sharePart?.items || [], insurancePart?.items || []).sort((a, b) => a.date.localeCompare(b.date))

  const fareItems = Array.from(fareByClient.entries()).map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount)
  const commissionItems = Array.from(commissionByClient.entries()).map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount)
  const insuranceItems = Array.from(insuranceByClient.entries()).map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount)

  const fareTotal = fareItems.reduce((sum, i) => sum + i.amount, 0)
  const commissionTotal = commissionItems.reduce((sum, i) => sum + i.amount, 0)
  const insuranceTotal = insuranceItems.reduce((sum, i) => sum + i.amount, 0)
  const maintTotal = maintItems.reduce((sum, i) => sum + i.amount, 0)
  const fuelTotal = fuelItems.reduce((sum, i) => sum + i.amount, 0)
  const miscTotal = miscItems.reduce((sum, i) => sum + i.amount, 0)

  const incomeTotal = fareTotal - commissionTotal - insuranceTotal + fuelSubsidyTotal
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
      insurance: { total: insuranceTotal, items: insuranceItems },
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
