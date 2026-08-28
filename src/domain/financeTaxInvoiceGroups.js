// @ts-check
// finance.js를 쪼갠 조각. 세금계산서 "원천 그룹" 계산(매출/매입/수수료 소스 그룹,
// 기사 정산 상세·거래처별 재그룹)만 담는다 — 레코드 조립(id/발급 상태 등)은
// financeTaxInvoiceEntries.js로 뺐다. cars.js의 getVehicleSupplierIdentity는 아직
// 타입이 없어 반환 모양을 SupplierIdentity로 명시적으로 좁힌다.
import { getEffectiveDriverSettlementMode, getShortCarNum, getVehicleSupplierIdentity } from './cars.js'
import { getFixedRouteClient } from './clients.js'
import { isDateWithinAssignment } from './drivers.js'
import { parseCurrencyValue } from './money.js'
import { calculateDriverVehicleCommission, getDriverCarWorkData, getMonthlyDriverTotals, logData } from './financeCore.js'

/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('./financeTypes.js').WorkDataByLogId} WorkDataByLogId */
/** @typedef {import('./financeTypes.js').CarLike} CarLike */
/** @typedef {import('./financeTypes.js').DriverLinkLike} DriverLinkLike */
/** @typedef {{ key?: string, biz?: object, carLabel?: string, carNumber?: string }} SupplierIdentity */
/** @typedef {{ type: 'call'|'fixed', dateKey: string, client: string, loadLoc: string, unloadLoc: string, fare: number, vatExempt: boolean, platform?: string, distanceKm?: string|number, cargoTonnage?: string|number, paymentDueDate?: string, remarks?: string, fixedCount?: number }} DriverTrip */

/** @param {string} monthKey @param {'sales'|'purchase'|'commission'} [flow] @param {FinanceSettings} [settings] @param {WorkDataByLogId} [workDataByLogId] */
export function getTaxInvoiceSourceGroups(monthKey, flow = 'sales', settings = {}, workDataByLogId = {}) {
  const cars = settings.cars || []
  if (flow === 'sales') {
    /** @type {Record<string, { partyKey: string, clientName: string, partyType: string, count: number, supplyAmount: number, taxAmount: number, supplierKey?: string, supplierBiz?: object, vehicleLabel?: string, vehicleNumbers: Set<string> }>} */
    const grouped = {}
    /** @type {Array<{ logId: string, car: CarLike|null, data: Record<string, import('./day-record.js').DayRecordLike> }>} */
    const sources = [{ logId: 'main', car: null, data: logData(workDataByLogId, 'main') }]
    cars.filter((car) => car.type === 'sub').forEach((car) => {
      const mode = getEffectiveDriverSettlementMode(car, settings)
      if (mode === 'company' || mode === 'employee') sources.push({ logId: car.number, car, data: getDriverCarWorkData(car, workDataByLogId) })
    })
    /** @param {string} clientName @param {SupplierIdentity} supplier @param {string} vehicleKey */
    const getOrCreateGroup = (clientName, supplier, vehicleKey) => {
      const groupKey = `${clientName}__${vehicleKey}`
      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          partyKey: groupKey,
          clientName,
          partyType: 'client',
          count: 0,
          supplyAmount: 0,
          taxAmount: 0,
          supplierKey: supplier.key,
          supplierBiz: supplier.biz,
          vehicleLabel: supplier.carLabel,
          vehicleNumbers: new Set(),
        }
      }
      return grouped[groupKey]
    }

    const fixedRouteClientForInvoice = getFixedRouteClient(settings)
    const fixedClientName = fixedRouteClientForInvoice?.companyName || ''
    const fixedUnitPrice = parseCurrencyValue(fixedRouteClientForInvoice?.fixedUnitPrice)

    sources.forEach((source) => {
      const supplier = /** @type {SupplierIdentity} */ (getVehicleSupplierIdentity(source.car, settings))
      Object.entries(source.data || {}).forEach(([dateKey, record]) => {
        ;(record?.callDetails || []).forEach((detail) => {
          const workDate = detail.workDate || dateKey
          const clientName = (detail.client || '').trim()
          const supplyAmount = parseCurrencyValue(detail.fare)
          if (!workDate.startsWith(monthKey) || !clientName || supplyAmount <= 0) return
          const group = getOrCreateGroup(clientName, supplier, source.logId)
          group.count += 1
          group.supplyAmount += supplyAmount
          group.taxAmount += detail.vatExempt ? 0 : Math.round(supplyAmount * 0.1)
          if (supplier.carNumber) group.vehicleNumbers.add(supplier.carNumber)
        })

        const fixedCount = parseInt(String(record?.fixedCount), 10) || 0
        if (fixedCount > 0 && fixedClientName && dateKey.startsWith(monthKey)) {
          const supplyAmount = fixedCount * fixedUnitPrice
          if (supplyAmount > 0) {
            const group = getOrCreateGroup(fixedClientName, supplier, source.logId)
            group.count += fixedCount
            group.supplyAmount += supplyAmount
            group.taxAmount += Math.round(supplyAmount * 0.1)
            if (supplier.carNumber) group.vehicleNumbers.add(supplier.carNumber)
          }
        }
      })
    })
    return Object.values(grouped).map((group) => ({
      ...group,
      vehicleNumbers: Array.from(group.vehicleNumbers),
      totalAmount: group.supplyAmount + group.taxAmount,
    }))
  }

  return cars.filter((car) => car.type === 'sub').flatMap((car) => {
    const mode = getEffectiveDriverSettlementMode(car, settings)
    if ((flow === 'purchase' && mode !== 'company') || (flow === 'commission' && mode !== 'driver_direct')) return []
    const link = (settings.driverLinks || []).find((item) => item.id === car.driverLinkId || item.vehicleNumber === car.number)
    const totals = getMonthlyDriverTotals(getDriverCarWorkData(car, workDataByLogId), monthKey, link)
    if (totals.grossAmount <= 0) return []
    const commissionAmount = calculateDriverVehicleCommission(car, totals.grossAmount, totals.count)
    const insuranceAmount = car.insuranceOn ? totals.insuranceAmount : 0
    const netAmount = Math.max(0, totals.grossAmount - commissionAmount - insuranceAmount)
    const supplyAmount = flow === 'purchase'
      ? (settings.driverInvoiceBasis === 'gross' ? totals.grossAmount : netAmount)
      : commissionAmount
    if (supplyAmount <= 0) return []
    const taxAmount = Math.round(supplyAmount * 0.1)
    return [{
      partyKey: car.number,
      clientName: car.driverName || car.personalInfo?.driverName || getShortCarNum(car.number),
      partyType: 'driver',
      carNumber: car.number,
      count: totals.count,
      grossAmount: totals.grossAmount,
      commissionAmount,
      insuranceAmount,
      netAmount,
      supplyAmount,
      taxAmount,
      totalAmount: supplyAmount + taxAmount,
    }]
  })
}

/** @param {Record<string, import('./day-record.js').DayRecordLike>} data @param {string} monthKey @param {DriverLinkLike} [link] */
export function flattenLinkedDriverTrips(data, monthKey, link) {
  /** @type {Array<DriverTrip>} */
  const trips = []
  Object.entries(data || {}).forEach(([dateKey, record]) => {
    if (!dateKey.startsWith(monthKey) || !record || typeof record !== 'object' || record.isOff) return
    if (!isDateWithinAssignment(dateKey, link?.assignmentStart, link?.assignmentEnd)) return

    ;(Array.isArray(record.callDetails) ? record.callDetails : []).forEach((detail) => {
      const workDate = detail.workDate || dateKey
      if (!workDate.startsWith(monthKey) || !isDateWithinAssignment(workDate, link?.assignmentStart, link?.assignmentEnd)) return
      trips.push({
        type: 'call',
        dateKey: workDate,
        client: (detail.client || '').trim(),
        loadLoc: detail.loadLoc || '',
        unloadLoc: detail.unloadLoc || '',
        fare: parseCurrencyValue(detail.fare),
        vatExempt: !!detail.vatExempt,
        platform: detail.platform || '',
        distanceKm: detail.distanceKm || '',
        cargoTonnage: detail.cargoTonnage || '',
        paymentDueDate: detail.paymentDueDate || '',
        remarks: detail.remarks || '',
      })
    })

    const fixedCount = Number(record.fixedCount || record.count || 0)
    const fixedFare = parseCurrencyValue(record.fare || record.fixedFare || record.totalFare)
    if (fixedCount > 0 || fixedFare > 0) {
      trips.push({ type: 'fixed', dateKey, client: '', loadLoc: '', unloadLoc: '', fare: fixedFare, vatExempt: false, fixedCount })
    }
  })
  return trips.sort((a, b) => b.dateKey.localeCompare(a.dateKey))
}

/** @param {Record<string, import('./day-record.js').DayRecordLike>} data @param {string} monthKey @param {DriverLinkLike} link @param {CarLike} car */
export function getLinkedDriverSettlementDetail(data, monthKey, link, car) {
  const totals = getMonthlyDriverTotals(data, monthKey, link)
  const commissionAmount = calculateDriverVehicleCommission(car, totals.grossAmount, totals.count)
  const insuranceAmount = car?.insuranceOn ? totals.insuranceAmount : 0
  const finalAmount = Math.max(0, totals.grossAmount - commissionAmount - insuranceAmount)
  const trips = flattenLinkedDriverTrips(data, monthKey, link)
  return {
    totalFare: totals.grossAmount,
    tripCount: totals.count,
    commissionAmount,
    insuranceAmount,
    finalAmount,
    trips,
    tripsFareSum: trips.reduce((sum, t) => sum + t.fare, 0),
  }
}

/** @param {Array<DriverTrip>} trips @param {CarLike} car @param {FinanceSettings} ownerSettings */
export function getLinkedDriverClientInvoiceGroups(trips, car, ownerSettings) {
  const supplier = /** @type {SupplierIdentity} */ (getVehicleSupplierIdentity(car, ownerSettings))
  /** @type {Record<string, { clientName: string, count: number, supplyAmount: number, taxAmount: number, trips: Array<DriverTrip> }>} */
  const grouped = {}
  let unassignedCount = 0
  trips.filter((t) => t.type === 'call').forEach((trip) => {
    if (!trip.client) { unassignedCount += 1; return }
    if (trip.fare <= 0) return
    const key = trip.client
    if (!grouped[key]) grouped[key] = { clientName: trip.client, count: 0, supplyAmount: 0, taxAmount: 0, trips: [] }
    grouped[key].count += 1
    grouped[key].supplyAmount += trip.fare
    grouped[key].taxAmount += trip.vatExempt ? 0 : Math.round(trip.fare * 0.1)
    grouped[key].trips.push(trip)
  })
  const groups = Object.values(grouped).map((g) => ({ ...g, totalAmount: g.supplyAmount + g.taxAmount, supplierBiz: supplier.biz, vehicleLabel: supplier.carLabel }))
  return { groups, unassignedCount }
}
