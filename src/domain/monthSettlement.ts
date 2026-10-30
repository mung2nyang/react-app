// 월간 운송료 정산 공용 순수 계산.
// §6: 헬퍼+본문이 한 계산 경로라 분리하면 항상 같이 읽게 됨(~210줄 허용).
import { getShortCarNum } from './cars.ts'
import { countCallTrips, getCallDetails, getFixedCount, getPalletCount } from './day-record.ts'
import { monthTotal } from './expenses.ts'
import { calculateDriverVehicleCommission, getCallDetailCommissionAmount } from './financeCore.ts'
import { driverShareBaseAmount, resolveDriverShareBase } from './driverShareBase.ts'
import { getFixedRouteCommissionAmount } from './fixedRouteCommission.ts'
import { callInsuranceTotal } from './call-details.ts'
import { parseCurrencyValue, vatOf } from './money.ts'
import type { CallDetailLike } from './callDetail.ts'
import type { ClientLike } from './clientTypes.ts'
import type { DayRecordLike } from './dayRecordTypes.ts'
import type { ExpenseItem } from './expenseTypes.ts'
import type { CarLike } from './financeTypes.ts'

/** 원본 getRecordTotalDistance — 이 파일 전용. */
function getRecordTotalDistance(record: DayRecordLike | null | undefined) {
  const details = getCallDetails(record)
  const hasDetailDistance = details.some((d) => String(d?.distanceKm ?? '').trim() !== '')
  if (hasDetailDistance) {
    return details.reduce((sum, d) => sum + (parseFloat(String(d?.distanceKm)) || 0), 0)
  }
  return parseFloat(String(record?.dailyDistance ?? '')) || 0
}

/** expensesForVehicleDay와 같은 차량 태그 동등비교. */
function expensesForVehicle(expenses: Array<ExpenseItem>, logId: string) {
  const target = logId === 'main' ? undefined : logId
  return (expenses || []).filter(
    (item) => (String(item.vehicleNumber || '').trim() || undefined) === target,
  )
}

function formatCommLabel(value: string | number | null | undefined, type: string | null | undefined) {
  if (type === 'direct') return `${parseCurrencyValue(value).toLocaleString()}원`
  return `${value}%`
}

function callCommLabel(detail: CallDetailLike, clients: Array<ClientLike>) {
  const snap = detail?.commissionSnapshot
  if (snap) return snap.enabled ? formatCommLabel(snap.value, snap.type) : ''
  const client = (clients || []).find((c) => c.companyName === detail?.client)
  return client?.commEnabled ? formatCommLabel(client.commValue, client.commType) : ''
}

/** @param month 0-based */
export function monthSettlementSummary(workData: Record<string, DayRecordLike>, year: number, month: number, options: { logId?: string, unitPrice?: number, fixedRouteClient?: ClientLike | null,
  activeFixedOn?: boolean, clients?: Array<ClientLike>, car?: CarLike | null,
  distanceOn?: boolean, expenses?: Array<ExpenseItem> } = {}) {
  const logId = options.logId || 'main'
  const unitPrice = Number(options.unitPrice) || 0
  const fixedRouteClient = options.fixedRouteClient || null
  const activeFixedOn = !!options.activeFixedOn
  const clients = Array.isArray(options.clients) ? options.clients : []
  const car = options.car || null
  const expenses = Array.isArray(options.expenses) ? options.expenses : []
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
  let trips = 0
  let callTrips = 0
  let fixedBaseFare = 0
  let defaultBaseFare = 0
  let palletFare = 0
  let fare = 0
  let commissionTotal = 0
  let distanceKm = 0
  // 부가세는 매출(financeOwnerDetail.ts)과 같은 규칙: 고정노선·파렛트는 날마다, 콜 상세는 건마다 반올림하고 면세면 0.
  let vat = 0
  let insuranceTotal = 0
  const fareByClient: Record<string, number> = {}
  const commissionByClient: Record<string, number> = {}
  const commissionLabelByClient: Record<string, string> = {}

  for (const [dateKey, record] of Object.entries(workData || {})) {
    if (!dateKey.startsWith(prefix) || !record || typeof record !== 'object' || record.isOff) continue
    const fixedCount = getFixedCount(record)
    trips += fixedCount
    callTrips += countCallTrips(record)
    distanceKm += getRecordTotalDistance(record)
    insuranceTotal += callInsuranceTotal(record)

    if (fixedCount > 0) {
      const fAmount = fixedCount * unitPrice
      fare += fAmount
      vat += vatOf(fAmount)
      const name = fixedRouteClient?.companyName || ''
      if (name) {
        fareByClient[name] = (fareByClient[name] || 0) + fAmount
        if (fixedRouteClient?.commEnabled) {
          const fixedComm = getFixedRouteCommissionAmount(fixedRouteClient, fAmount, fixedCount)
          const isPercent = fixedRouteClient.commType === 'percent' || !fixedRouteClient.commType
          commissionLabelByClient[name] = formatCommLabel(fixedRouteClient.commValue, isPercent ? 'percent' : 'direct')
          commissionByClient[name] = (commissionByClient[name] || 0) + fixedComm
          commissionTotal += fixedComm
        }
      } else {
        fixedBaseFare += fAmount
      }
    }

    const palletCount = getPalletCount(record)
    if (palletCount > 0 && activeFixedOn && fixedRouteClient?.palletOn) {
      const pAmount = palletCount * parseCurrencyValue(fixedRouteClient.palletPrice)
      palletFare += pAmount
      vat += vatOf(pAmount)
    }

    getCallDetails(record).forEach((detail) => {
      const gross = parseCurrencyValue(detail?.fare)
      fare += gross
      if (!detail?.vatExempt) vat += vatOf(gross)
      const clientName = detail?.client ? String(detail.client).trim() : ''
      const registered = !!(clientName && clients.some((c) => c.companyName === clientName))
      const comm = getCallDetailCommissionAmount(detail, gross, { clients })
      if (clientName && comm > 0) {
        commissionByClient[clientName] = (commissionByClient[clientName] || 0) + comm
        commissionTotal += comm
        const label = callCommLabel(detail, clients)
        if (label) commissionLabelByClient[clientName] = label
      }
      if (registered) fareByClient[clientName] = (fareByClient[clientName] || 0) + gross
      else defaultBaseFare += gross
    })
  }

  let subCarComm = 0
  let subCarCommLabel = '기사 차량 수수료'
  if (logId !== 'main' && car) {
    subCarComm = calculateDriverVehicleCommission(car, driverShareBaseAmount(car, fare + palletFare, commissionTotal))
    if (car.commEnabled && car.commission) {
      subCarCommLabel = `${getShortCarNum(car.number)} 차량 ${parseFloat(String(car.commission)) || 0}%`
    }
  }

  const vehicleExpenses = expensesForVehicle(expenses, logId)
  const maint = monthTotal(vehicleExpenses, 'maint', year, month)
  const fuel = monthTotal(vehicleExpenses, 'fuel', year, month)
  const misc = monthTotal(vehicleExpenses, 'misc', year, month)
  // 콜 상세 산재보험료도 합계에서 뺀다(로드맵 40, 달력·홈·운송비 내역서 같음).
  const total = fare + palletFare - commissionTotal - subCarComm - insuranceTotal + vat

  return {
    trips, callTrips, fixedBaseFare, defaultBaseFare, fareByClient, commissionByClient,
    commissionLabelByClient, palletFare, subCarComm, subCarCommLabel, subCarCommBase: resolveDriverShareBase(car), distanceKm, fare,
    commissionTotal, insuranceTotal, vat, total, maint, fuel, misc,
  }
}
