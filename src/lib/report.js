import { monthTotal } from './expenses.js'
import { monthWorkFareSummary } from './workData.js'
import { resolveFixedUnitPrice } from '../domain/clients.js'
import {
  readOwnerCars,
  readOwnerClients,
  readOwnerExpenses,
  readOwnerProfile,
  readOwnerSettings,
  readOwnerWorkData,
} from '../store/ownerDataHooks.js'

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
