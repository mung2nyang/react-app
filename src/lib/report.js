import { loadCars } from './cars.js'
import { loadExpenses, monthTotal } from './expenses.js'
import { loadPracticeSettings } from './practiceSettings.js'
import { loadProfile } from './profile.js'
import { loadWorkData, monthWorkFareSummary } from './workData.js'

export function dash(value) {
  const text = String(value || '').trim()
  return text || '-'
}

export function buildMonthReport(ownerKey, year, monthIndex) {
  const workData = loadWorkData(ownerKey)
  const settings = loadPracticeSettings(ownerKey)
  const profile = loadProfile(ownerKey)
  const cars = loadCars(ownerKey)
  const expenses = loadExpenses(ownerKey)
  const fare = monthWorkFareSummary(workData, year, monthIndex, settings.unitPrice)
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
    unitPrice: settings.unitPrice,
    fare: fare.fare,
    vat: fare.vat,
    total: fare.total,
    maint,
    fuel,
    misc,
  }
}
