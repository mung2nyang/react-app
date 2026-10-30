// 결제·수수료·월 매출(getMonthlyFareRevenue) 등 순수 계산(finance.ts가 재수출).
// §6 예외(~250 한도 내) — getMonthlyDriverTotals 계산이 한 함수 안에서 응집돼야 해서 나누지 않는다.
import {
  getShortCarNum,
  isVehicleRevenueSharedWithOwner,
} from './cars.ts'
import { computeFixedRouteFare, getFixedRouteClient, resolveFixedUnitPrice } from './clients.ts'
import { isDateWithinAssignment } from './drivers.ts'
import { parseCurrencyValue } from './money.ts'
import type { CallDetailLike } from './callDetail.ts'
import type { CarLike, DriverLinkLike, FinanceSettings, WorkDataByLogId } from './financeTypes.ts'
import { callCountsAsTrip, type DayRecordLike } from './day-record.ts'

export function logData(workDataByLogId: WorkDataByLogId, logId: string) {
  if (!workDataByLogId) return {}
  return workDataByLogId[logId] || {}
}

export function getDriverCarWorkData(car: CarLike, workDataByLogId: WorkDataByLogId) {
  return logData(workDataByLogId, car?.number)
}

export function getDetailPaymentSummary(detail: CallDetailLike) {
  const fare = parseCurrencyValue(detail?.fare)

  if (!Array.isArray(detail?.payments)) {
    const legacyPaid = (detail?.paymentStatus || '미수') !== '미수'
    return {
      paidAmount: legacyPaid ? fare : 0,
      remainingAmount: legacyPaid ? 0 : fare,
      status: (legacyPaid ? 'paid' : 'unpaid') as 'paid' | 'unpaid',
    }
  }

  const paidAmount = detail.payments.reduce((sum, payment) => sum + (parseCurrencyValue(payment.amount) || 0), 0)
  const remainingAmount = Math.max(fare - paidAmount, 0)
  let status: 'paid' | 'partial' | 'unpaid' = 'unpaid'
  if (paidAmount > 0 && remainingAmount > 0) status = 'partial'
  else if (paidAmount > 0 && remainingAmount <= 0) status = 'paid'

  return { paidAmount, remainingAmount, status }
}

export function syncDetailPaymentStatus(detail: CallDetailLike) {
  const summary = getDetailPaymentSummary(detail)
  detail.paymentStatus = summary.status === 'paid' ? '수금 완료' : '미수'
  return summary
}

export function getCallDetailDurationMinutes(detail: CallDetailLike) {
  const dep = detail?.departureTime
  const arr = detail?.arrivalTime
  if (!dep || !arr) return 0
  const [sh, sm] = dep.split(':').map(Number)
  const [eh, em] = arr.split(':').map(Number)
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0
  let minutes = (eh * 60 + em) - (sh * 60 + sm)
  if (minutes < 0) minutes += 1440
  return minutes
}

/** 수수료 판단 정본 — 저장된 commissionSnapshot 우선, 없으면 현재 거래처 설정. */
export function resolveCallDetailCommission(detail: CallDetailLike | null | undefined, settings: FinanceSettings): { enabled: boolean, type: string | null | undefined, value: string | number | null | undefined } {
  const snapshot = detail?.commissionSnapshot
  if (snapshot) return { enabled: snapshot.enabled, type: snapshot.type, value: snapshot.value }
  const client = (settings.clients || []).find((c) => c.companyName === detail?.client)
  return { enabled: !!client?.commEnabled, type: client?.commType, value: client?.commValue }
}

export function getCallDetailCommissionAmount(detail: CallDetailLike, fare: number, settings: FinanceSettings) {
  const { enabled, type, value } = resolveCallDetailCommission(detail, settings)
  if (!enabled) return 0
  return type === 'direct' ? parseCurrencyValue(value) : Math.floor(fare * (parseFloat(String(value)) || 0) / 100)
}

// 고정노선 운행(fixedCount)은 그날 기록에 금액이 저장 안 되고 단가×횟수로 매번
// 계산된다(clients.ts computeFixedRouteFare, getOwnerMonthlyFinanceDetail과 공식
// 공유) — settings 없이는 이 계산을 못 하므로 인자로 받는다(없으면 고정노선 운행이 0으로 잡힌다).
// scopeKey: 고정 노선 거래처를 찾을 차량 번호(없으면 연동 정보의 차량 번호).
export function getMonthlyDriverTotals(data: Record<string, DayRecordLike>, monthKey: string, link: DriverLinkLike | null = null, settings: FinanceSettings = {}, scopeKey?: string) {
  const key = scopeKey || link?.vehicleNumber
  const fixedRouteClient = getFixedRouteClient(settings, key)
  const fixedRouteOpts = {
    fixedUnitPrice: resolveFixedUnitPrice(settings, key),
    palletUnitPrice: parseCurrencyValue(fixedRouteClient?.palletPrice),
    subFixedOn: !!settings.subFixedOn,
    activePalletOn: !!fixedRouteClient?.palletOn,
  }
  let grossAmount = 0
  let insuranceAmount = 0
  let count = 0
  Object.entries(data || {}).forEach(([dateKey, record]) => {
    if (!dateKey.startsWith(monthKey) || !record || typeof record !== 'object' || record.isOff) return
    if (!isDateWithinAssignment(dateKey, link?.assignmentStart, link?.assignmentEnd)) return
    const details = Array.isArray(record.callDetails) ? record.callDetails : []
    details.forEach((detail) => {
      const workDate = detail.workDate || dateKey
      if (!workDate.startsWith(monthKey)) return
      if (!isDateWithinAssignment(workDate, link?.assignmentStart, link?.assignmentEnd)) return
      grossAmount += parseCurrencyValue(detail.fare)
      insuranceAmount += parseCurrencyValue((detail as { insuranceFee?: string | number }).insuranceFee)
      if (callCountsAsTrip(detail)) count += 1
    })
    const storedFare = parseCurrencyValue(record.fare || record.fixedFare || record.totalFare)
    grossAmount += storedFare > 0 ? storedFare : computeFixedRouteFare(record, fixedRouteOpts)
    count += Number(record.fixedCount || record.count || 0)
  })
  return { grossAmount, insuranceAmount, count }
}

export function calculateDriverVehicleCommission(car: CarLike, grossAmount: number) {
  // 옛 건당 자료는 수수료 미설정으로 읽는다(기사 몫 0원).
  if (!car?.commEnabled || !car.commission || car.commType === 'direct') return 0
  return Math.floor(grossAmount * (parseFloat(String(car.commission)) || 0) / 100)
}

export function getMonthlyFareRevenue(monthKey: string, settings: FinanceSettings = {}, workDataByLogId: WorkDataByLogId = {}) {
  const cars = Array.isArray(settings.cars) ? settings.cars : []

  const sources = [{ logId: 'main', label: '메인 차량', data: logData(workDataByLogId, 'main') }]
  cars.filter((car) => car.type === 'sub' && isVehicleRevenueSharedWithOwner(car)).forEach((car) => {
    sources.push({ logId: car.number, label: getShortCarNum(car.number), data: getDriverCarWorkData(car, workDataByLogId) })
  })

  let totalFare = 0
  let tripCount = 0
  const byVehicle: Array<{ logId: string, label: string, fare: number, tripCount: number }> = []

  sources.forEach((source) => {
    const isMain = source.logId === 'main'
    const activeFixedOn = isMain ? settings.fixedOn : settings.subFixedOn
    // 소스(차량)별 스코프 고정노선 우선, 없으면 차주 것 fallback(getFixedRouteClient).
    const fixedRouteClientForTotals = getFixedRouteClient(settings, source.logId)
    const activePalletOn = !!fixedRouteClientForTotals?.palletOn
    const fixedUnitPrice = resolveFixedUnitPrice(settings, source.logId)
    const palletUnitPrice = parseCurrencyValue(fixedRouteClientForTotals?.palletPrice)

    let vehicleFare = 0
    let vehicleCount = 0

    Object.entries(source.data || {}).forEach(([dateKey, record]) => {
      if (!dateKey.startsWith(monthKey) || !record || typeof record !== 'object' || record.isOff) return

      if (Number(record.fixedCount) > 0) {
        vehicleCount += parseInt(String(record.fixedCount), 10) || 0
        vehicleFare += (Number(record.fixedCount) || 0) * fixedUnitPrice
      }
      if (Number(record.palletCount) > 0 && activeFixedOn && activePalletOn) {
        vehicleFare += (Number(record.palletCount) || 0) * palletUnitPrice
      }

      ;(Array.isArray(record.callDetails) ? record.callDetails : []).forEach((detail) => {
        const type = detail?.distanceType || ''
        if (type === '공차') {
          // 0회 처리
        } else if (type === '혼짐') {
          if (detail.linkedLoadIndex === 'pending' || detail.linkedLoadIndex === '-1' || detail.linkedLoadIndex === undefined) {
            vehicleCount += 1
          }
        } else {
          vehicleCount += 1
        }

        const gross = parseCurrencyValue(detail?.fare)
        vehicleFare += gross
      })
    })

    totalFare += vehicleFare
    tripCount += vehicleCount
    byVehicle.push({ logId: source.logId, label: source.label, fare: vehicleFare, tripCount: vehicleCount })
  })

  return { totalFare, tripCount, byVehicle }
}
export function getMonthlyDriverSalaryExpense(monthKey: string, _settings: FinanceSettings, subCars: Array<CarLike>) {
  const monthStart = `${monthKey}-01`
  const items: Array<{ date: string, label: string, amount: number }> = []
  let total = 0
  for (const car of subCars || []) {
    if (car.driverPayMode !== 'salary') continue
    const amount = parseCurrencyValue(car.driverSalaryAmount)
    if (amount <= 0) continue
    items.push({ date: monthStart, label: car.driverName || getShortCarNum(car.number), amount })
    total += amount
  }
  return { total, items: items.sort((a, b) => a.date.localeCompare(b.date)) }
}
