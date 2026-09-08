// @ts-check
// 리포트 세부 내역서 — 거래처 옵션·콜상세 집계.
import { getCallDetails, isOffDay } from '../domain/day-record.js'
import { getCallDetailCommissionAmount } from '../domain/financeCore.js'
import { parseCurrencyValue } from '../domain/money.js'

/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */
/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {import('../domain/callDetail.js').CallDetailLike} CallDetailLike */

/**
 * 세부 내역서 거래처 선택 옵션 — 등록 거래처 ∪ 해당 월 콜상세 거래처 ∪ 미지정, ALL 선행.
 * @param {Record<string, DayRecordLike>|null|undefined} workData
 * @param {number} year
 * @param {number} monthIndex
 * @param {Array<ClientLike>|null|undefined} clients
 * @returns {Array<string>}
 */
export function detailReportClientOptions(workData, year, monthIndex, clients) {
  /** @type {Set<string>} */
  const clientSet = new Set()
  ;(clients || []).forEach((client) => {
    const name = String(client?.companyName || '').trim()
    if (name) clientSet.add(name)
  })
  const lastDate = new Date(year, monthIndex + 1, 0).getDate()
  for (let day = 1; day <= lastDate; day += 1) {
    const dateKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const record = workData?.[dateKey]
    if (!record || isOffDay(record)) continue
    getCallDetails(record).forEach((/** @type {CallDetailLike} */ detail) => {
      const name = String(detail?.client || '').trim()
      if (name) clientSet.add(name)
    })
  }
  clientSet.add('미지정')
  return ['ALL', ...clientSet]
}

/**
 * @param {CallDetailLike|null|undefined} detail
 * @param {{ clients?: Array<ClientLike> }} settings
 * @returns {string|null}
 */
function detailCommissionLabel(detail, settings) {
  const snapshot = detail?.commissionSnapshot
  let enabled
  let type
  let value
  if (snapshot) {
    enabled = snapshot.enabled
    type = snapshot.type
    value = snapshot.value
  } else {
    const client = (settings.clients || []).find((c) => c.companyName === detail?.client)
    enabled = !!client?.commEnabled
    type = client?.commType
    value = client?.commValue
  }
  if (!enabled) return null
  if (type === 'direct') return `${parseCurrencyValue(value).toLocaleString('ko-KR')}원`
  return `${value}%`
}

/**
 * 거래처별 세부 내역서(콜상세만, 고정노선 미포함).
 * @param {Record<string, DayRecordLike>|null|undefined} workData
 * @param {number} year
 * @param {number} monthIndex
 * @param {string} clientFilter
 * @param {{ clients?: Array<ClientLike> }} settings
 */
export function buildDetailReport(workData, year, monthIndex, clientFilter, settings = {}) {
  /** @type {Array<{ dateStr: string, loadLoc: string, unloadLoc: string, client: string, fare: number }>} */
  const items = []
  let totalFare = 0
  let totalCommission = 0
  let defaultBaseFare = 0
  /** @type {Record<string, number>} */
  const monthFareByClient = {}
  /** @type {Record<string, number>} */
  const monthCommByClient = {}
  /** @type {Record<string, string>} */
  const clientCommLabels = {}
  const lastDate = new Date(year, monthIndex + 1, 0).getDate()

  for (let day = 1; day <= lastDate; day += 1) {
    const dateKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const record = workData?.[dateKey]
    if (!record || isOffDay(record)) continue
    getCallDetails(record).forEach((/** @type {CallDetailLike} */ detail) => {
      const clientName = detail?.client || '미지정'
      if (clientFilter !== 'ALL' && clientFilter !== clientName) return
      const fare = parseCurrencyValue(detail?.fare)
      const registered = !!(detail?.client && (settings.clients || []).some((c) => c.companyName === detail.client))
      let commission = 0
      if (detail?.client) {
        commission = getCallDetailCommissionAmount(detail, fare, settings)
        if (commission > 0) {
          monthCommByClient[clientName] = (monthCommByClient[clientName] || 0) + commission
          const label = detailCommissionLabel(detail, settings)
          if (label) clientCommLabels[clientName] = label
        }
      }
      if (registered) monthFareByClient[clientName] = (monthFareByClient[clientName] || 0) + fare
      else defaultBaseFare += fare
      items.push({
        dateStr: `${monthIndex + 1}월 ${day}일`,
        loadLoc: detail?.loadLoc || '-',
        unloadLoc: detail?.unloadLoc || '-',
        client: clientName,
        fare,
      })
      totalFare += fare
      totalCommission += commission
    })
  }

  const vat = Math.round(totalFare * 0.1)
  return {
    items,
    totalFare,
    totalCommission,
    defaultBaseFare,
    monthFareByClient,
    monthCommByClient,
    clientCommLabels,
    vat,
    grandTotal: totalFare - totalCommission + vat,
  }
}
