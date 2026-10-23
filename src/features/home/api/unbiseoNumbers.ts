// 운비서 질문의 숫자 — 매출·미수금 화면과 같은 함수를 그 순간 값으로 부른다(로드맵 24-D-2). 새 계산 없음.
import { getOwnerMonthlyFinanceDetail, getReceivableItems, getTaxInvoiceSourceGroups } from '../../../domain/finance.ts'
import { getDriverSelfMonthlyDetail } from '../../../domain/driverSelfRevenue.ts'
import { buildFinanceSettings } from '../../../data/sync/ownerFinance.ts'
import { readOwnerDriverExpenses, readOwnerExpenses, readOwnerWorkDataByLogId } from '../../../data/store/ownerDataHooks.ts'
import type { QuestionNumbers, QuestionPeriod, UnbiseoQuestion } from './unbiseoQuestion.ts'

/** 그 기간의 달 — 연은 12달(매출 화면 연 탭도 달마다 같은 함수), 전체는 없음. */
export function monthsOf(period: QuestionPeriod): Array<string> {
  if (period.unit === 'month') return [period.value]
  if (period.unit === 'year') return Array.from({ length: 12 }, (_, i) => `${period.value}-${String(i + 1).padStart(2, '0')}`)
  return []
}

function inPeriod(workDate: string, period: QuestionPeriod): boolean {
  if (period.unit === 'month' || period.unit === 'year') return String(workDate || '').startsWith(period.value)
  return true
}

/** 질문을 받은 그 순간 Store 값으로 — 구독·저장 없음. */
export function questionNumbers(ownerKey: string, question: UnbiseoQuestion, isDriver: boolean): QuestionNumbers {
  const settings = buildFinanceSettings(ownerKey)
  const workDataByLogId = readOwnerWorkDataByLogId(ownerKey)
  const months = monthsOf(question.period)

  // 미수금 화면: getReceivableItems의 남은 금액(거래처·달은 화면 묶음과 같은 기준 — client, workDate 앞 7자).
  if (question.type === 'unpaid') {
    const items = getReceivableItems(settings, workDataByLogId)
      .filter((item) => (!question.client || item.client === question.client) && inPeriod(item.workDate, question.period))
    return { amount: items.reduce((sum, item) => sum + item.remainingAmount, 0), count: items.length, supply: 0 }
  }

  // 거래처 매출: 서류 발급 [세금계산서] 탭(메인 서류)의 그 거래처 묶음.
  if (question.type === 'revenue' && question.client) {
    let supply = 0
    let amount = 0
    let count = 0
    months.forEach((monthKey) => {
      getTaxInvoiceSourceGroups(monthKey, 'sales', settings, workDataByLogId, 'main')
        .filter((group) => group.clientName === question.client)
        .forEach((group) => { supply += group.supplyAmount; amount += group.totalAmount; count += group.count })
    })
    return { amount, count, supply }
  }

  // 매출 화면: 차주는 기본 "차주" 탭, 연동 기사는 기사 본인 화면.
  const expenses = readOwnerExpenses(ownerKey)
  const driverExpenses = readOwnerDriverExpenses(ownerKey)
  const details = months.map((monthKey) => (isDriver
    ? getDriverSelfMonthlyDetail(monthKey, settings, workDataByLogId, expenses)
    : getOwnerMonthlyFinanceDetail(monthKey, 'owner', settings, workDataByLogId, expenses, driverExpenses)))
  const sum = (pick: (detail: (typeof details)[number]) => number) => details.reduce((total, detail) => total + (Number(pick(detail)) || 0), 0)
  if (question.type === 'trips') return { amount: 0, count: sum((detail) => detail.tripCount), supply: 0 }
  if (question.type === 'netProfit') return { amount: sum((detail) => detail.netProfit), count: 0, supply: 0 }
  if (question.type === 'expense') {
    const kind = question.expenseType
    return { amount: sum((detail) => (kind ? detail.expense[kind].total : detail.expense.total)), count: 0, supply: 0 }
  }
  return { amount: sum((detail) => detail.income.total), count: 0, supply: 0 }
}
