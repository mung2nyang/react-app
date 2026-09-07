// @ts-check
// §6: 리포트 파일명 생성 함수(PDF·PNG)를 한곳에 모아 이름 규칙을 한 번에 대조하기 위해 분리하지 않음(217줄)
import { monthTotal } from './expenses.js'
import { monthWorkFareSummary } from './workData.js'
import { resolveFixedUnitPrice } from '../domain/clients.js'
import { getCallDetails, isOffDay } from '../domain/day-record.js'
import { getCallDetailCommissionAmount } from '../domain/financeCore.js'
import { parseCurrencyValue } from '../domain/money.js'
import {
  readOwnerCars,
  readOwnerClients,
  readOwnerExpenses,
  readOwnerProfile,
  readOwnerSettings,
  readOwnerWorkData,
} from '../store/ownerDataHooks.js'

/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */
/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {import('../domain/callDetail.js').CallDetailLike} CallDetailLike */

/** @param {unknown} value */
export function dash(value) {
  const text = String(value || '').trim()
  return text || '-'
}

/**
 * 월간 운송비 내역서 PDF 파일명(원본 downloadPDF 요약 분기와 동일, 월은 0-based monthIndex).
 * @param {number} year
 * @param {number} monthIndex 0=1월 … 11=12월
 */
export function buildReportFileName(year, monthIndex) {
  return `${year}년_${monthIndex + 1}월_운송비내역서.pdf`
}

/**
 * 세부 내역서 PDF 파일명.
 * @param {number} year
 * @param {number} monthIndex
 * @param {string} clientFilter
 */
export function buildDetailReportFileName(year, monthIndex, clientFilter) {
  const suffix = clientFilter === 'ALL' ? '전체' : clientFilter
  return `${year}년_${monthIndex + 1}월_운송비내역서(세부)_${suffix}.pdf`
}

/**
 * 월간 운송비 내역서 PNG 파일명(이미지 저장용, PDF 파일명 규칙 재사용).
 * @param {number} year
 * @param {number} monthIndex
 */
export function buildReportImageFileName(year, monthIndex) {
  return buildReportFileName(year, monthIndex).replace(/\.pdf$/, '.png')
}

/**
 * 세부 내역서 PNG 파일명.
 * @param {number} year
 * @param {number} monthIndex
 * @param {string} clientFilter
 */
export function buildDetailReportImageFileName(year, monthIndex, clientFilter) {
  return buildDetailReportFileName(year, monthIndex, clientFilter).replace(/\.pdf$/, '.png')
}

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

/**
 * @param {string} ownerKey
 * @param {number} year
 * @param {number} monthIndex
 */
export function buildMonthReport(ownerKey, year, monthIndex, expenses = readOwnerExpenses(ownerKey), cars = readOwnerCars(ownerKey), practiceSettings = readOwnerSettings(ownerKey), workData = readOwnerWorkData(ownerKey), clients = readOwnerClients(ownerKey), profile = readOwnerProfile(ownerKey)) {
  const unitPrice = resolveFixedUnitPrice({ clients })
  const fare = monthWorkFareSummary(workData, year, monthIndex, unitPrice)
  const maint = monthTotal(expenses, 'maint', year, monthIndex)
  const fuel = monthTotal(expenses, 'fuel', year, monthIndex)
  const misc = monthTotal(expenses, 'misc', year, monthIndex)
  const mainCar = (cars || []).find((car) => car.type === 'main') || cars[0] || null

  return {
    year,
    monthIndex,
    title: `${year}년 ${monthIndex + 1}월 운송비 내역서`,
    profile,
    mainCar,
    trips: fare.trips,
    callTrips: fare.callTrips,
    unitPrice,
    fare: fare.fare,
    vat: fare.vat,
    total: fare.total,
    maint,
    fuel,
    misc,
  }
}
