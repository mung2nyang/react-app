// 세금계산서 "원천 그룹" 계산(거래처 매출 소스 그룹, 기사 정산 상세·거래처별 재그룹) — 레코드 조립(id/발급 상태 등)은 financeTaxInvoiceEntries.ts.
import { getVehicleSupplierIdentity } from './cars.ts'
import { computeFixedRouteFare, getFixedRouteClient, resolveFixedUnitPrice } from './clients.ts'
import { isDateWithinAssignment } from './drivers.ts'
import { parseCurrencyValue, vatOf } from './money.ts'
import { calculateDriverVehicleCommission, getDriverCarWorkData, getMonthlyDriverTotals, logData } from './financeCore.ts'
import { driverShareBaseAmount, getMonthlyDriverClientCommission } from './driverShareBase.ts'
import type { CarLike, DriverLinkLike, FinanceSettings, SupplierBiz, WorkDataByLogId } from './financeTypes.ts'
import { getPalletCount } from './day-record.ts'
import type { DayRecordLike } from './day-record.ts'

export type SupplierIdentity = { key?: string, biz?: SupplierBiz, carLabel?: string, carNumber?: string }
export type DriverTrip = { type: 'call' | 'fixed', dateKey: string, client: string, loadLoc: string, unloadLoc: string, fare: number, vatExempt: boolean, platform?: string, distanceKm?: string | number, cargoTonnage?: string | number, paymentDueDate?: string, remarks?: string, fixedCount?: number, palletFare?: number }

/** 거래처 매출 계산서 원천 그룹(메인 + 기사차량 운행분). 계산서 종류는 매출뿐(기사 매입·수수료 발행 삭제, 2026-10-02) — flow는 저장 id 호환용. logKey('main'|차량번호)를 넘기면 그 차량 운행분만(서류 발급 차량별, 세금계산서 정리 ②). */
export function getTaxInvoiceSourceGroups(monthKey: string, flow: 'sales' = 'sales', settings: FinanceSettings = {}, workDataByLogId: WorkDataByLogId = {}, logKey?: string) {
  const cars = settings.cars || []
  if (flow !== 'sales') return []
  const grouped: Record<string, { partyKey: string, clientName: string, partyType: string, count: number, supplyAmount: number, taxAmount: number, supplierKey?: string, supplierBiz?: SupplierBiz, vehicleLabel?: string, vehicleNumbers: Set<string> }> = {}
  const sources: Array<{ logId: string, car: CarLike | null, data: Record<string, DayRecordLike> }> = [{ logId: 'main', car: null, data: logData(workDataByLogId, 'main') }]
  cars.filter((car) => car.type === 'sub').forEach((car) => {
    sources.push({ logId: car.number, car, data: getDriverCarWorkData(car, workDataByLogId) })
  })
  const getOrCreateGroup = (clientName: string, supplier: SupplierIdentity, vehicleKey: string) => {
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

  sources.filter((source) => !logKey || source.logId === logKey).forEach((source) => {
    // 소스(차량)별 스코프 고정노선 우선, 없으면 차주 것 fallback(getFixedRouteClient).
    const fixedRouteClientForInvoice = getFixedRouteClient(settings, source.logId)
    const fixedClientName = fixedRouteClientForInvoice?.companyName || ''
    const fixedUnitPrice = parseCurrencyValue(fixedRouteClientForInvoice?.fixedUnitPrice)
    const palletOn = !!(source.logId === 'main' ? settings.fixedOn : settings.subFixedOn) && !!fixedRouteClientForInvoice?.palletOn
    const palletUnitPrice = parseCurrencyValue(fixedRouteClientForInvoice?.palletPrice)
    const supplier = getVehicleSupplierIdentity(source.car, settings) as SupplierIdentity
    Object.entries(source.data || {}).forEach(([dateKey, record]) => {
      // 휴무 날은 콜·고정 노선·파렛트 모두 빼기(다른 합계와 같음).
      if (record?.isOff) return
      ;(record?.callDetails || []).forEach((detail) => {
        const workDate = detail.workDate || dateKey
        const clientName = (detail.client || '').trim()
        const supplyAmount = parseCurrencyValue(detail.fare)
        if (!workDate.startsWith(monthKey) || !clientName || supplyAmount <= 0) return
        const group = getOrCreateGroup(clientName, supplier, source.logId)
        group.count += 1
        group.supplyAmount += supplyAmount
        group.taxAmount += detail.vatExempt ? 0 : vatOf(supplyAmount)
        if (supplier.carNumber) group.vehicleNumbers.add(supplier.carNumber)
      })

      const fixedCount = parseInt(String(record?.fixedCount), 10) || 0
      if (fixedCount > 0 && fixedClientName && dateKey.startsWith(monthKey)) {
        const supplyAmount = fixedCount * fixedUnitPrice
        if (supplyAmount > 0) {
          const group = getOrCreateGroup(fixedClientName, supplier, source.logId)
          group.count += fixedCount
          group.supplyAmount += supplyAmount
          group.taxAmount += vatOf(supplyAmount)
          if (supplier.carNumber) group.vehicleNumbers.add(supplier.carNumber)
        }
      }

      // 파렛트도 고정 노선 거래처 계산서에 — 달력·매출과 같은 조건(고정 노선 켜짐 + 거래처 파렛트 켜짐), 부가세는 날마다.
      const palletAmount = getPalletCount(record) * palletUnitPrice
      if (palletOn && palletAmount > 0 && fixedClientName && dateKey.startsWith(monthKey)) {
        const group = getOrCreateGroup(fixedClientName, supplier, source.logId)
        group.supplyAmount += palletAmount
        group.taxAmount += vatOf(palletAmount)
        if (supplier.carNumber) group.vehicleNumbers.add(supplier.carNumber)
      }
    })
  })
  return Object.values(grouped).map((group) => ({
    ...group,
    vehicleNumbers: Array.from(group.vehicleNumbers),
    totalAmount: group.supplyAmount + group.taxAmount,
  }))
}

// 고정노선(fixedCount)은 그날 기록에 금액이 없어 단가×횟수로 계산해야
// 드릴다운 목록의 "고정" 트립 금액도 0이 아니게 나온다(getMonthlyDriverTotals와
// 같은 공식, computeFixedRouteFare 재사용, 2026-09-17).
export function flattenLinkedDriverTrips(data: Record<string, DayRecordLike>, monthKey: string, link?: DriverLinkLike, settings: FinanceSettings = {}) {
  const fixedRouteClient = getFixedRouteClient(settings, link?.vehicleNumber)
  const fixedRouteOpts = {
    fixedUnitPrice: resolveFixedUnitPrice(settings, link?.vehicleNumber),
    palletUnitPrice: parseCurrencyValue(fixedRouteClient?.palletPrice),
    subFixedOn: !!settings.subFixedOn,
    activePalletOn: !!fixedRouteClient?.palletOn,
  }
  const trips: Array<DriverTrip> = []
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
    const storedFare = parseCurrencyValue(record.fare || record.fixedFare || record.totalFare)
    const fixedFare = storedFare > 0 ? storedFare : computeFixedRouteFare(record, fixedRouteOpts)
    const palletFare = storedFare > 0 || !fixedRouteOpts.subFixedOn || !fixedRouteOpts.activePalletOn ? 0 : getPalletCount(record) * fixedRouteOpts.palletUnitPrice
    if (fixedCount > 0 || fixedFare > 0) {
      trips.push({ type: 'fixed', dateKey, client: '', loadLoc: '', unloadLoc: '', fare: fixedFare, vatExempt: false, fixedCount, palletFare })
    }
  })
  return trips.sort((a, b) => b.dateKey.localeCompare(a.dateKey))
}

export function getLinkedDriverSettlementDetail(data: Record<string, DayRecordLike>, monthKey: string, link: DriverLinkLike, car: CarLike, settings: FinanceSettings = {}) {
  const totals = getMonthlyDriverTotals(data, monthKey, link, settings)
  const base = driverShareBaseAmount(car, totals.grossAmount, getMonthlyDriverClientCommission(data, monthKey, link, settings))
  const commissionAmount = calculateDriverVehicleCommission(car, base)
  const insuranceAmount = car?.insuranceOn ? totals.insuranceAmount : 0
  const finalAmount = Math.max(0, totals.grossAmount - commissionAmount - insuranceAmount)
  const trips = flattenLinkedDriverTrips(data, monthKey, link, settings)
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

export function getLinkedDriverClientInvoiceGroups(trips: Array<DriverTrip>, car: CarLike, ownerSettings: FinanceSettings) {
  const supplier = getVehicleSupplierIdentity(car, ownerSettings) as SupplierIdentity
  const grouped: Record<string, { clientName: string, count: number, supplyAmount: number, taxAmount: number, trips: Array<DriverTrip> }> = {}
  /** 거래처 미지정 운행 — 계산서 대상 아님, 화면에 목록으로만 */
  const unassignedTrips: Array<DriverTrip> = []
  // 고정 노선(파렛트 포함)도 그 차량 고정 노선 거래처 카드에 — 서류 발급 세금계산서와 같게, 건수는 고정 횟수만, 부가세는 고정·파렛트 따로.
  const fixedClientName = getFixedRouteClient(ownerSettings, car?.number)?.companyName || ''
  trips.forEach((trip) => {
    const isFixed = trip.type === 'fixed'
    const key = isFixed ? fixedClientName : trip.client
    if (!key) { if (!isFixed) unassignedTrips.push(trip); return }
    if (trip.fare <= 0) return
    if (!grouped[key]) grouped[key] = { clientName: key, count: 0, supplyAmount: 0, taxAmount: 0, trips: [] }
    const palletFare = isFixed ? trip.palletFare || 0 : 0
    grouped[key].count += isFixed ? trip.fixedCount || 0 : 1
    grouped[key].supplyAmount += trip.fare
    grouped[key].taxAmount += isFixed ? vatOf(trip.fare - palletFare) + vatOf(palletFare) : trip.vatExempt ? 0 : vatOf(trip.fare)
    grouped[key].trips.push(trip)
  })
  const groups = Object.values(grouped).map((g) => ({ ...g, totalAmount: g.supplyAmount + g.taxAmount, supplierBiz: supplier.biz, vehicleLabel: supplier.carLabel }))
  return { groups, unassignedCount: unassignedTrips.length, unassignedTrips }
}
