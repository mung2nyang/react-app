// 소속기사 본인 매출 손익 — workLogs.main 전제, 정산액(매출제)은 getMonthlyDriverRevenueShareExpense와 같은 계산(link → 기간 합계 → 기사 몫 − 산재).
// 지출 카드는 expenses 로 채우되 netProfit 은 정산액 유지(Q1).
import { getShortCarNum, isVehicleRevenueSharedWithOwner } from './cars.ts'
import { getDriverIncomeDeductions, getDriverSettlementAmount } from './driverIncomeDeductions.ts'
import {
  calculateDriverVehicleCommission,
  getMonthlyDriverTotals,
  logData,
} from './financeCore.ts'
import { getOwnerMonthlyFinanceDetail } from './financeOwnerDetail.ts'
import { driverShareBaseAmount, getMonthlyDriverClientCommission } from './driverShareBase.ts'
import type { CarLike, FinanceSettings, WorkDataByLogId } from './financeTypes.ts'
import type { ExpenseItem } from './expenseTypes.ts'

const EMPTY_BUCKET = { total: 0, items: [] as Array<{ date: string, label: string, amount: number }> }

function settlementLabelForCar(car: CarLike, shareAmount: number) {
  if (car.driverPayMode === 'salary') return '기사 정산(월급)'
  if (shareAmount > 0 && car.commType !== 'direct' && car.commission) {
    const rate = String(car.commission).replace(/%/g, '').trim()
    if (rate) return `기사 정산(${rate}%)`
  }
  return '기사 정산'
}

function firstAssignedSubCar(settings: FinanceSettings): CarLike | null {
  const cars = Array.isArray(settings.cars) ? settings.cars : []
  const shared = cars.filter((car) => car.type === 'sub' && isVehicleRevenueSharedWithOwner(car))
  return shared[0] || null
}

export function getDriverSelfMonthlyDetail(monthKey: string, settings: FinanceSettings = {}, workDataByLogId: WorkDataByLogId = {}, expenses: Array<ExpenseItem> = []) {
  const assigned = firstAssignedSubCar(settings)
  // 기사 일지는 main으로 저장되지만 거래처는 배정 차량 스코프 — 운송료도 그 스코프로 찾는다(정산 계산과 같은 단가).
  const base = getOwnerMonthlyFinanceDetail(monthKey, 'owner', settings, workDataByLogId, expenses, [], assigned?.number)
  const monthStart = `${monthKey}-01`

  let settlementTotal = 0
  let label = '기사 정산'
  let items: Array<{ date: string, label: string, amount: number }> = []
  // 기사 화면에 공제 줄을 보이려고 넘긴다(로드맵 45) — 줄을 보일지는 차주 기사 관리(SettlementSummaryCard)와 같은 규칙.
  let breakdown = { amount: 0, insurance: 0, withholding: 0, showInsurance: false, showWithholding: false }

  if (assigned) {
    // 산재보험료·3.3% 원천징수는 차주 화면(driverRevenueShareExpense.ts)과 같은
    // 함수로 계산한다(기사 정산액 기준 월 단위 — 콜 상세 건별 insuranceFee는 더 안 쓴다).
    const links = Array.isArray(settings?.driverLinks) ? settings.driverLinks : []
    const link = links.find((item) => item.id === assigned.driverLinkId || item.vehicleNumber === assigned.number) || null
    const ownData = logData(workDataByLogId, 'main')
    const totals = getMonthlyDriverTotals(ownData, monthKey, link, settings)
    const base = driverShareBaseAmount(assigned, totals.grossAmount, getMonthlyDriverClientCommission(ownData, monthKey, link, settings))
    const commission = calculateDriverVehicleCommission(assigned, base, totals.count)
    const settlementAmount = getDriverSettlementAmount(assigned, commission)
    const deductions = getDriverIncomeDeductions(assigned, settlementAmount)
    settlementTotal = deductions.driverNet
    breakdown = {
      amount: deductions.settlementAmount,
      insurance: deductions.insuranceDriverShare,
      withholding: deductions.withholding,
      showInsurance: !!assigned.insuranceOn && assigned.driverIncomeType !== 'employee',
      showWithholding: !!assigned.withholdingOn,
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
      insurance: base.income.insurance,
      fuelSubsidy: EMPTY_BUCKET,
      settlement: {
        total: settlementTotal,
        items,
        label,
        payMode: assigned?.driverPayMode || null,
        breakdown,
      },
      // 화면에 보이는 운송료·운임수수료·산재보험료 줄의 합(유가보조금은 driverSelf에서 숨김)
      total: (Number(base.income.fare.total) || 0) - (Number(base.income.commission.total) || 0) - (Number(base.income.insurance.total) || 0),
    },
    expense: base.expense,
  }
}
