// @ts-check
// 재감사 2차(FAIL 지적) — finance.js를 200줄 이하로 실제로 쪼갠 조각. 미수(콜상세
// 단위) 목록·연체 목록만 담는다. 정본은 financeCore.js/financeOwnerDetail.js와
// 같은 방식(sources: main + 정산모드가 company/employee인 매출공유 기사차량)으로
// 소스를 모은다 — 오너 손익 상세(financeOwnerDetail.js)의 unpaidItems 계산도 이
// 파일의 getReceivableItems를 그대로 가져다 쓴다(중복 구현 없음).
// 재감사 3차(FAIL 지적 4번) — @ts-check 적용.
import { getEffectiveDriverSettlementMode, getShortCarNum } from './cars.js'
import { resolveCallDetailId } from './callDetailIds.js'
import { parseCurrencyValue } from './money.js'
import { getDetailPaymentSummary, getDriverCarWorkData, logData } from './financeCore.js'

/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('./financeTypes.js').WorkDataByLogId} WorkDataByLogId */
/** @typedef {import('./callDetail.js').PaymentLike} PaymentLike */

/**
 * @param {FinanceSettings} [settings]
 * @param {WorkDataByLogId} [workDataByLogId]
 */
export function getReceivableItems(settings = {}, workDataByLogId = {}) {
  const cars = settings.cars || []
  /** @type {Array<{ logId: string, logLabel: string, data: Record<string, import('./day-record.js').DayRecordLike> }>} */
  const sources = []
  if (settings.paymentOn) {
    sources.push({ logId: 'main', logLabel: '메인 차량', data: logData(workDataByLogId, 'main') })
  }
  if (settings.subPaymentOn) {
    cars.filter((car) => car.type === 'sub').forEach((car) => {
      const mode = getEffectiveDriverSettlementMode(car, settings)
      if (mode === 'company' || mode === 'employee') {
        sources.push({ logId: car.number, logLabel: getShortCarNum(car.number), data: getDriverCarWorkData(car, workDataByLogId) })
      }
    })
  }

  /** @type {Array<{ dateKey: string, detailId: string, logId: string, logLabel: string, client: string, fare: number, paidAmount: number, remainingAmount: number, paymentSummaryStatus: string, payments: Array<PaymentLike>, paymentDueDate: string, workDate: string, loadLoc: string, unloadLoc: string, remarks: string }>} */
  const items = []

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
        if (paymentSummary.status === 'paid') {
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

/**
 * @param {FinanceSettings} settings
 * @param {WorkDataByLogId} workDataByLogId
 * @param {Date} [now]
 */
export function getOverdueReceivableItems(settings, workDataByLogId, now = new Date()) {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return getReceivableItems(settings, workDataByLogId).filter((item) => {
    if (!item.paymentDueDate) return false
    const dueDate = new Date(`${item.paymentDueDate}T00:00:00`)
    return !Number.isNaN(dueDate.getTime()) && dueDate < today
  })
}
