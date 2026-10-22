// 미수(콜상세 단위) 목록·연체 목록 — 오너 손익 상세(financeOwnerDetail.ts)의 unpaidItems도 이 파일의 getReceivableItems를 쓴다.
import { getShortCarNum } from './cars.ts'
import { resolveCallDetailId } from './callDetailIds.ts'
import { parseCurrencyValue } from './money.ts'
import { getDetailPaymentSummary, getDriverCarWorkData, logData } from './financeCore.ts'
import type { FinanceSettings, WorkDataByLogId } from './financeTypes.ts'
import type { PaymentLike } from './callDetail.ts'
import type { DayRecordLike } from './day-record.ts'

export type ReceivableItemLike = {
  dateKey: string
  detailId: string
  logId: string
  logLabel: string
  client: string
  fare: number
  paidAmount: number
  remainingAmount: number
  paymentSummaryStatus: string
  payments: Array<PaymentLike>
  paymentDueDate: string
  workDate: string
  loadLoc: string
  unloadLoc: string
  remarks: string
}

export function getReceivableItems(settings: FinanceSettings = {}, workDataByLogId: WorkDataByLogId = {}) {
  const cars = settings.cars || []
  const sources: Array<{ logId: string, logLabel: string, data: Record<string, DayRecordLike> }> = []
  if (settings.paymentOn) {
    sources.push({ logId: 'main', logLabel: '메인 차량', data: logData(workDataByLogId, 'main') })
  }
  if (settings.subPaymentOn) {
    cars.filter((car) => car.type === 'sub').forEach((car) => {
      sources.push({ logId: car.number, logLabel: getShortCarNum(car.number), data: getDriverCarWorkData(car, workDataByLogId) })
    })
  }

  const items: Array<ReceivableItemLike> = []

  sources.forEach((source) => {
    Object.keys(source.data || {}).forEach((dateKey) => {
      const record = source.data[dateKey]

      if (!record || record.isOff || !record.callDetails) {
        return
      }

      record.callDetails.forEach((detail) => {
        const detailId = resolveCallDetailId(detail)
        if (!detailId) return
        const paymentSummary = getDetailPaymentSummary(detail)
        // 받을 돈이 남은 운행만 미수다 — 0원 운행·다 받은 운행은 뺀다(로드맵 42, 매출 미입금과 같은 기준).
        if (paymentSummary.status === 'paid' || paymentSummary.remainingAmount <= 0) {
          return
        }

        items.push({
          dateKey,
          detailId,
          logId: source.logId,
          logLabel: source.logLabel,
          client: detail.client || '미지정 거래처',
          fare: parseCurrencyValue(detail.fare),
          paidAmount: paymentSummary.paidAmount,
          remainingAmount: paymentSummary.remainingAmount,
          paymentSummaryStatus: paymentSummary.status,
          payments: Array.isArray(detail.payments) ? detail.payments : [],
          paymentDueDate: detail.paymentDueDate || '',
          workDate: detail.workDate || dateKey,
          loadLoc: detail.loadLoc || '',
          unloadLoc: detail.unloadLoc || '',
          remarks: detail.remarks || '',
        })
      })
    })
  })

  return items
}

export function getOverdueReceivableItems(settings: FinanceSettings, workDataByLogId: WorkDataByLogId, now: Date = new Date()) {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return getReceivableItems(settings, workDataByLogId).filter((item) => {
    if (!item.paymentDueDate) return false
    const dueDate = new Date(`${item.paymentDueDate}T00:00:00`)
    return !Number.isNaN(dueDate.getTime()) && dueDate < today
  })
}
