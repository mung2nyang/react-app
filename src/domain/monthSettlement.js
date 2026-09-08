// @ts-check
// 월간 운송료 정산 공용 순수 계산(이관 계획 ③-1). 화면 연결은 ③-2/③-3.
// §6: 헬퍼+본문이 한 계산 경로라 분리하면 항상 같이 읽게 됨(~210줄 허용).
import { getShortCarNum } from './cars.js'
import { countCallTrips, getCallDetails, getFixedCount, getPalletCount } from './day-record.js'
import { monthTotal } from './expenses.js'
import { calculateDriverVehicleCommission, getCallDetailCommissionAmount } from './financeCore.js'
import { parseCurrencyValue } from './money.js'

/** @typedef {import('./callDetail.js').CallDetailLike} CallDetailLike */
/** @typedef {import('./clientTypes.js').ClientLike} ClientLike */
/** @typedef {import('./dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {import('./expenseTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {import('./financeTypes.js').CarLike} CarLike */

/** 원본 getRecordTotalDistance — 이 파일 전용. @param {DayRecordLike|null|undefined} record */
function getRecordTotalDistance(record) {
  const details = getCallDetails(record)
  const hasDetailDistance = details.some((d) => String(d?.distanceKm ?? '').trim() !== '')
  if (hasDetailDistance) {
    return details.reduce((sum, d) => sum + (parseFloat(String(d?.distanceKm)) || 0), 0)
  }
  return parseFloat(String(record?.dailyDistance ?? '')) || 0
}

/** expensesForVehicleDay와 같은 차량 태그 동등비교. @param {Array<ExpenseItem>} expenses @param {string} logId */
function expensesForVehicle(expenses, logId) {
  const target = logId === 'main' ? undefined : logId
  return (expenses || []).filter(
    (item) => (String(item.vehicleNumber || '').trim() || undefined) === target,
  )
}

/** @param {string|number|null|undefined} value @param {string|null|undefined} type */
function formatCommLabel(value, type) {
  if (type === 'direct') return `${parseCurrencyValue(value).toLocaleString()}원`
  return `${value}%`
}

/** @param {CallDetailLike} detail @param {Array<ClientLike>} clients */
function callCommLabel(detail, clients) {
  const snap = detail?.commissionSnapshot
  if (snap) return snap.enabled ? formatCommLabel(snap.value, snap.type) : ''
  const client = (clients || []).find((c) => c.companyName === detail?.client)
  return client?.commEnabled ? formatCommLabel(client.commValue, client.commType) : ''
}

/**
 * @param {Record<string, DayRecordLike>} workData
 * @param {number} year
 * @param {number} month 0-based
 * @param {{ logId?: string, unitPrice?: number, fixedRouteClient?: ClientLike|null,
 *   activeFixedOn?: boolean, clients?: Array<ClientLike>, car?: CarLike|null,
 *   distanceOn?: boolean, expenses?: Array<ExpenseItem> }} [options]
 */
export function monthSettlementSummary(workData, year, month, options = {}) {
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
  /** @type {Record<string, number>} */
  const fareByClient = {}
  /** @type {Record<string, number>} */
  const commissionByClient = {}
  /** @type {Record<string, string>} */
  const commissionLabelByClient = {}

  for (const [dateKey, record] of Object.entries(workData || {})) {
    if (!dateKey.startsWith(prefix) || !record || typeof record !== 'object' || record.isOff) continue
    const fixedCount = getFixedCount(record)
    trips += fixedCount
    callTrips += countCallTrips(record)
    distanceKm += getRecordTotalDistance(record)

    if (fixedCount > 0) {
      const fAmount = fixedCount * unitPrice
      fare += fAmount
      const name = fixedRouteClient?.companyName || ''
      if (name) {
        fareByClient[name] = (fareByClient[name] || 0) + fAmount
        if (fixedRouteClient?.commEnabled) {
          let fixedComm = 0
          if (fixedRouteClient.commType === 'percent' || !fixedRouteClient.commType) {
            fixedComm = Math.floor(fAmount * (parseFloat(String(fixedRouteClient.commValue)) / 100))
            commissionLabelByClient[name] = formatCommLabel(fixedRouteClient.commValue, 'percent')
          } else {
            fixedComm = parseCurrencyValue(fixedRouteClient.commValue) * Math.max(1, fixedCount)
            commissionLabelByClient[name] = formatCommLabel(fixedRouteClient.commValue, 'direct')
          }
          commissionByClient[name] = (commissionByClient[name] || 0) + fixedComm
          commissionTotal += fixedComm
        }
      } else {
        fixedBaseFare += fAmount
      }
    }

    const palletCount = getPalletCount(record)
    if (palletCount > 0 && activeFixedOn && fixedRouteClient?.palletOn) {
      palletFare += palletCount * parseCurrencyValue(fixedRouteClient.palletPrice)
    }

    getCallDetails(record).forEach((detail) => {
      const gross = parseCurrencyValue(detail?.fare)
      fare += gross
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
  let subCarCommLabel = '기사차량 수수료'
  if (logId !== 'main' && car) {
    subCarComm = calculateDriverVehicleCommission(car, fare + palletFare - commissionTotal, trips + callTrips)
    if (car.commEnabled && car.commission) {
      subCarCommLabel = car.commType === 'direct'
        ? `${getShortCarNum(car.number)} 차량 건당 ${parseCurrencyValue(car.commission).toLocaleString()}원`
        : `${getShortCarNum(car.number)} 차량 ${parseFloat(String(car.commission)) || 0}%`
    }
  }

  const vehicleExpenses = expensesForVehicle(expenses, logId)
  const maint = monthTotal(vehicleExpenses, 'maint', year, month)
  const fuel = monthTotal(vehicleExpenses, 'fuel', year, month)
  const misc = monthTotal(vehicleExpenses, 'misc', year, month)
  const vat = Math.round((fare + palletFare) * 0.1)
  const total = fare + palletFare - commissionTotal - subCarComm + vat

  return {
    trips, callTrips, fixedBaseFare, defaultBaseFare, fareByClient, commissionByClient,
    commissionLabelByClient, palletFare, subCarComm, subCarCommLabel, distanceKm, fare,
    commissionTotal, vat, total, maint, fuel, misc,
  }
}
