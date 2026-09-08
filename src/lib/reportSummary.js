// @ts-check
// 리포트 요약 — 일자별 표 행·월간 요약 집계.
import { getFixedRouteClient, resolveFixedUnitPrice } from '../domain/clients.js'
import {
  callFareTotal,
  dayTripCount,
  getFixedCount,
  getPalletCount,
  isOffDay,
} from '../domain/day-record.js'
import { monthSettlementSummary } from '../domain/monthSettlement.js'
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

/**
 * 리포트 요약 중간 일자별 표 행(원본 buildReportPage workList 규칙).
 * @param {Record<string, DayRecordLike>|null|undefined} workData
 * @param {number} year
 * @param {number} monthIndex
 * @param {{ unitPrice?: number, fixedRouteClient?: ClientLike|null, showPallet?: boolean }} [options]
 * @returns {Array<{ day: number, isOff: boolean, workVal: number, palletCount: number, amount: number }>}
 */
export function buildReportDayRows(workData, year, monthIndex, options = {}) {
  const unitPrice = Number(options.unitPrice) || 0
  const showPallet = !!options.showPallet
  const palletUnitPrice = parseCurrencyValue(options.fixedRouteClient?.palletPrice)
  const lastDate = new Date(year, monthIndex + 1, 0).getDate()
  /** @type {Array<{ day: number, isOff: boolean, workVal: number, palletCount: number, amount: number }>} */
  const rows = []
  for (let day = 1; day <= lastDate; day += 1) {
    const dateKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const record = workData?.[dateKey]
    if (!record) continue
    if (isOffDay(record)) {
      rows.push({ day, isOff: true, workVal: 0, palletCount: 0, amount: 0 })
      continue
    }
    const workVal = dayTripCount(record)
    const palletCount = showPallet ? getPalletCount(record) : 0
    const dayFare = getFixedCount(record) * unitPrice + callFareTotal(record)
    const amount = dayFare + palletCount * palletUnitPrice
    if (workVal > 0 || palletCount > 0) {
      rows.push({ day, isOff: false, workVal, palletCount, amount })
    }
  }
  return rows
}

/**
 * @param {string} ownerKey
 * @param {number} year
 * @param {number} monthIndex
 */
export function buildMonthReport(ownerKey, year, monthIndex, expenses = readOwnerExpenses(ownerKey), cars = readOwnerCars(ownerKey), practiceSettings = readOwnerSettings(ownerKey), workData = readOwnerWorkData(ownerKey), clients = readOwnerClients(ownerKey), profile = readOwnerProfile(ownerKey)) {
  void expenses
  const unitPrice = resolveFixedUnitPrice({ clients })
  const fixedRouteClient = getFixedRouteClient({ clients })
  const showPallet = !!practiceSettings.fixedOn && !!fixedRouteClient?.palletOn
  const settled = monthSettlementSummary(workData, year, monthIndex, {
    unitPrice,
    fixedRouteClient,
    activeFixedOn: !!practiceSettings.fixedOn,
    clients,
  })
  const days = buildReportDayRows(workData, year, monthIndex, {
    unitPrice,
    fixedRouteClient,
    showPallet,
  })
  const mainCar = (cars || []).find((car) => car.type === 'main') || cars[0] || null

  return {
    year,
    monthIndex,
    title: `${year}년 ${monthIndex + 1}월 운송비 내역서`,
    profile,
    mainCar,
    days,
    showPallet,
    distanceKm: settled.distanceKm,
    fixedBaseFare: settled.fixedBaseFare,
    defaultBaseFare: settled.defaultBaseFare,
    fareByClient: settled.fareByClient,
    commissionByClient: settled.commissionByClient,
    commissionLabelByClient: settled.commissionLabelByClient,
    vat: settled.vat,
    total: settled.total,
  }
}
