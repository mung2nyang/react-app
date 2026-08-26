import {
  getEffectiveDriverSettlementMode,
  getShortCarNum,
  getVehicleSupplierIdentity,
  isVehicleRevenueSharedWithOwner,
} from './cars.js'
import { getFixedRouteClient } from './clients.js'
import { isDateWithinAssignment } from './drivers.js'
import { parseCurrencyValue } from './money.js'

function logData(workDataByLogId, logId) {
  if (!workDataByLogId) return {}
  return workDataByLogId[logId] || {}
}

export function getDriverCarWorkData(car, workDataByLogId) {
  return logData(workDataByLogId, car?.number)
}

export function getDetailPaymentSummary(detail) {
  const fare = parseCurrencyValue(detail?.fare)

  if (!Array.isArray(detail?.payments)) {
    const legacyPaid = (detail?.paymentStatus || '미수') !== '미수'
    return {
      paidAmount: legacyPaid ? fare : 0,
      remainingAmount: legacyPaid ? 0 : fare,
      status: legacyPaid ? 'paid' : 'unpaid',
    }
  }

  const paidAmount = detail.payments.reduce((sum, payment) => sum + (parseCurrencyValue(payment.amount) || 0), 0)
  const remainingAmount = Math.max(fare - paidAmount, 0)
  let status = 'unpaid'
  if (paidAmount > 0 && remainingAmount > 0) status = 'partial'
  else if (paidAmount > 0 && remainingAmount <= 0) status = 'paid'

  return { paidAmount, remainingAmount, status }
}

export function syncDetailPaymentStatus(detail) {
  const summary = getDetailPaymentSummary(detail)
  detail.paymentStatus = summary.status === 'paid' ? '수금 완료' : '미수'
  return summary
}

export function getCallDetailDurationMinutes(detail) {
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

export function getCallDetailCommissionAmount(detail, fare, settings) {
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
  if (!enabled) return 0
  return type === 'direct' ? parseCurrencyValue(value) : Math.floor(fare * (parseFloat(value) || 0) / 100)
}

export function getMonthlyDriverTotals(data, monthKey, link = null) {
  let grossAmount = 0
  let insuranceAmount = 0
  let count = 0
  Object.entries(data || {}).forEach(([dateKey, record]) => {
    if (!dateKey.startsWith(monthKey) || !record || typeof record !== 'object') return
    if (!isDateWithinAssignment(dateKey, link?.assignmentStart, link?.assignmentEnd)) return
    const details = Array.isArray(record.callDetails) ? record.callDetails : []
    details.forEach((detail) => {
      const workDate = detail.workDate || dateKey
      if (!workDate.startsWith(monthKey)) return
      if (!isDateWithinAssignment(workDate, link?.assignmentStart, link?.assignmentEnd)) return
      grossAmount += parseCurrencyValue(detail.fare)
      insuranceAmount += parseCurrencyValue(detail.insuranceFee)
      count += 1
    })
    const fixedFare = parseCurrencyValue(record.fare || record.fixedFare || record.totalFare)
    if (fixedFare > 0) grossAmount += fixedFare
    count += Number(record.fixedCount || record.count || 0)
  })
  return { grossAmount, insuranceAmount, count }
}

export function calculateDriverVehicleCommission(car, grossAmount, count) {
  if (!car?.commEnabled || !car.commission) return 0
  const tripCount = Number(count) || 0
  if (car.commType === 'direct') return tripCount > 0 ? parseCurrencyValue(car.commission) * tripCount : 0
  return Math.floor(grossAmount * (parseFloat(car.commission) || 0) / 100)
}

export function getMonthlyFareRevenue(monthKey, settings = {}, workDataByLogId = {}) {
  const cars = Array.isArray(settings.cars) ? settings.cars : []

  const sources = [{ logId: 'main', label: '메인 차량', data: logData(workDataByLogId, 'main') }]
  cars.filter((car) => car.type === 'sub' && isVehicleRevenueSharedWithOwner(car)).forEach((car) => {
    const mode = getEffectiveDriverSettlementMode(car, settings)
    if (mode === 'company' || mode === 'employee') {
      sources.push({ logId: car.number, label: getShortCarNum(car.number), data: getDriverCarWorkData(car, workDataByLogId) })
    }
  })

  let totalFare = 0
  let tripCount = 0
  const byVehicle = []

  const fixedRouteClientForTotals = getFixedRouteClient(settings)
  sources.forEach((source) => {
    const isMain = source.logId === 'main'
    const activeFixedOn = isMain ? settings.fixedOn : settings.subFixedOn
    const activePalletOn = !!fixedRouteClientForTotals?.palletOn
    const fixedUnitPrice = parseCurrencyValue(fixedRouteClientForTotals?.fixedUnitPrice)
    const palletUnitPrice = parseCurrencyValue(fixedRouteClientForTotals?.palletPrice)

    let vehicleFare = 0
    let vehicleCount = 0

    Object.entries(source.data || {}).forEach(([dateKey, record]) => {
      if (!dateKey.startsWith(monthKey) || !record || typeof record !== 'object' || record.isOff) return

      if (record.fixedCount > 0) {
        vehicleCount += parseInt(record.fixedCount, 10) || 0
        vehicleFare += (Number(record.fixedCount) || 0) * fixedUnitPrice
      }
      if (record.palletCount > 0 && activeFixedOn && activePalletOn) {
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

export function getReceivableItems(settings = {}, workDataByLogId = {}) {
  const cars = settings.cars || []
  const sources = []
  if (settings.paymentOn) {
    sources.push({ logId: 'main', logLabel: '메인 차량', data: logData(workDataByLogId, 'main') })
  }
  if (settings.subPaymentOn) {
    cars.filter((car) => car.type === 'sub').forEach((car) => {
      const mode = getEffectiveDriverSettlementMode(car, settings)
      if (mode === 'company' || mode === 'employee') {
        sources.push({ logId: car.number, logLabel: getShortCarNum(car.number), data: getDriverCarWorkData(car, workDataByLogId) })
      }
    })
  }

  const items = []

  sources.forEach((source) => {
    Object.keys(source.data || {}).forEach((dateKey) => {
      const record = source.data[dateKey]

      if (!record || record.isOff || !record.callDetails) {
        return
      }

      record.callDetails.forEach((detail, detailIndex) => {
        const paymentSummary = getDetailPaymentSummary(detail)
        if (paymentSummary.status === 'paid') {
          return
        }

        items.push({
          dateKey,
          detailIndex,
          logId: source.logId,
          logLabel: source.logLabel,
          client: detail.client || '미지정 거래처',
          fare: parseCurrencyValue(detail.fare),
          paidAmount: paymentSummary.paidAmount,
          remainingAmount: paymentSummary.remainingAmount,
          paymentSummaryStatus: paymentSummary.status,
          payments: Array.isArray(detail.payments) ? detail.payments : [],
          paymentDueDate: detail.paymentDueDate || '',
          workDate: detail.workDate || dateKey,
          loadLoc: detail.loadLoc || '',
          unloadLoc: detail.unloadLoc || '',
          remarks: detail.remarks || '',
        })
      })
    })
  })

  return items
}

export function getOverdueReceivableItems(settings, workDataByLogId, now = new Date()) {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return getReceivableItems(settings, workDataByLogId).filter((item) => {
    if (!item.paymentDueDate) return false
    const dueDate = new Date(`${item.paymentDueDate}T00:00:00`)
    return !Number.isNaN(dueDate.getTime()) && dueDate < today
  })
}

export function getOwnerMonthlyFinanceDetail(monthKey, scope = 'owner', settings = {}, workDataByLogId = {}) {
  const cars = Array.isArray(settings.cars) ? settings.cars : []

  const sources = []
  if (scope !== 'driver') sources.push({ logId: 'main', label: '메인 차량', data: logData(workDataByLogId, 'main') })
  if (scope !== 'owner') {
    cars.filter((car) => car.type === 'sub' && isVehicleRevenueSharedWithOwner(car)).forEach((car) => {
      const mode = getEffectiveDriverSettlementMode(car, settings)
      if (mode === 'company' || mode === 'employee') {
        sources.push({ logId: car.number, label: getShortCarNum(car.number), data: getDriverCarWorkData(car, workDataByLogId) })
      }
    })
  }

  const fixedRouteClientForTotals = getFixedRouteClient(settings)
  const fixedClientLabel = fixedRouteClientForTotals?.companyName || '고정노선'

  let tripCount = 0
  let distanceKm = 0
  let durationMinutes = 0
  let vatAmount = 0

  const fareByClient = new Map()
  const commissionByClient = new Map()
  const maintItems = []
  const fuelItems = []
  const miscItems = []
  const fuelSubsidyItems = []
  let fuelSubsidyTotal = 0

  sources.forEach((source) => {
    const isMain = source.logId === 'main'
    const activeFixedOn = isMain ? settings.fixedOn : settings.subFixedOn
    const activePalletOn = !!fixedRouteClientForTotals?.palletOn
    const fixedUnitPrice = parseCurrencyValue(fixedRouteClientForTotals?.fixedUnitPrice)
    const palletUnitPrice = parseCurrencyValue(fixedRouteClientForTotals?.palletPrice)

    Object.entries(source.data || {}).forEach(([dateKey, record]) => {
      if (!dateKey.startsWith(monthKey) || !record || typeof record !== 'object') return

      if (!record.isOff) {
        if (record.fixedCount > 0) {
          const count = Number(record.fixedCount) || 0
          tripCount += count
          const amount = count * fixedUnitPrice
          fareByClient.set(fixedClientLabel, (fareByClient.get(fixedClientLabel) || 0) + amount)
          vatAmount += Math.round(amount * 0.1)
        }
        if (record.palletCount > 0 && activeFixedOn && activePalletOn) {
          const amount = (Number(record.palletCount) || 0) * palletUnitPrice
          fareByClient.set(fixedClientLabel, (fareByClient.get(fixedClientLabel) || 0) + amount)
          vatAmount += Math.round(amount * 0.1)
        }

        ;(Array.isArray(record.callDetails) ? record.callDetails : []).forEach((detail) => {
          const type = detail?.distanceType || ''
          if (type === '공차') {
            // 0회 처리
          } else if (type === '혼짐') {
            if (detail.linkedLoadIndex === 'pending' || detail.linkedLoadIndex === '-1' || detail.linkedLoadIndex === undefined) tripCount += 1
          } else {
            tripCount += 1
          }

          const fare = parseCurrencyValue(detail?.fare)
          const clientLabel = detail?.client || '미지정 거래처'
          fareByClient.set(clientLabel, (fareByClient.get(clientLabel) || 0) + fare)

          if (!detail?.vatExempt) vatAmount += Math.round(fare * 0.1)

          const commission = getCallDetailCommissionAmount(detail, fare, settings)
          if (commission > 0) commissionByClient.set(clientLabel, (commissionByClient.get(clientLabel) || 0) + commission)

          distanceKm += parseCurrencyValue(detail?.distanceKm)
          durationMinutes += getCallDetailDurationMinutes(detail)
        })
      }

      ;(record.maintItems || []).forEach((item) => {
        maintItems.push({ date: dateKey, label: item.name || item.category || '정비', amount: parseCurrencyValue(item.fare) })
      })
      ;(record.fuelItems || []).forEach((item) => {
        const cost = parseCurrencyValue(item.cost)
        const subsidy = parseCurrencyValue(item.subsidy)
        fuelItems.push({ date: dateKey, label: `${item.type || '주유'}${item.liter ? ` ${item.liter}L` : ''}`, amount: cost })
        if (subsidy > 0) {
          fuelSubsidyItems.push({ date: dateKey, label: item.type || '주유', amount: subsidy })
          fuelSubsidyTotal += subsidy
        }
      })
      ;(record.miscItems || []).forEach((item) => {
        miscItems.push({ date: dateKey, label: item.name || item.category || '기타', amount: parseCurrencyValue(item.fare) })
      })
    })
  })

  const sortByDate = (a, b) => a.date.localeCompare(b.date)
  maintItems.sort(sortByDate)
  fuelItems.sort(sortByDate)
  miscItems.sort(sortByDate)
  fuelSubsidyItems.sort(sortByDate)

  const fareItems = Array.from(fareByClient.entries()).map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount)
  const commissionItems = Array.from(commissionByClient.entries()).map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount)

  const fareTotal = fareItems.reduce((sum, i) => sum + i.amount, 0)
  const commissionTotal = commissionItems.reduce((sum, i) => sum + i.amount, 0)
  const maintTotal = maintItems.reduce((sum, i) => sum + i.amount, 0)
  const fuelTotal = fuelItems.reduce((sum, i) => sum + i.amount, 0)
  const miscTotal = miscItems.reduce((sum, i) => sum + i.amount, 0)

  const incomeTotal = fareTotal - commissionTotal + fuelSubsidyTotal
  const expenseTotal = maintTotal + fuelTotal + miscTotal

  const unpaidItems = getReceivableItems(settings, workDataByLogId).filter((item) => {
    if (!item.workDate.startsWith(monthKey) || item.remainingAmount <= 0) return false
    if (scope === 'owner') return item.logId === 'main'
    if (scope === 'driver') return item.logId !== 'main'
    return true
  })
  const unpaidTotal = unpaidItems.reduce((sum, i) => sum + i.remainingAmount, 0)

  return {
    monthKey,
    tripCount,
    distanceKm: Math.round(distanceKm),
    durationHours: Math.round(durationMinutes / 60),
    vatAmount,
    netProfit: incomeTotal - expenseTotal,
    income: {
      total: incomeTotal,
      fare: { total: fareTotal, items: fareItems },
      commission: { total: commissionTotal, items: commissionItems },
      fuelSubsidy: { total: fuelSubsidyTotal, items: fuelSubsidyItems },
    },
    expense: {
      total: expenseTotal,
      maint: { total: maintTotal, items: maintItems },
      fuel: { total: fuelTotal, items: fuelItems },
      misc: { total: miscTotal, items: miscItems },
    },
    unpaid: { total: unpaidTotal, count: unpaidItems.length, items: unpaidItems },
  }
}

export function getTaxInvoiceSourceGroups(monthKey, flow = 'sales', settings = {}, workDataByLogId = {}) {
  const cars = settings.cars || []
  if (flow === 'sales') {
    const grouped = {}
    const sources = [{ logId: 'main', car: null, data: logData(workDataByLogId, 'main') }]
    cars.filter((car) => car.type === 'sub').forEach((car) => {
      const mode = getEffectiveDriverSettlementMode(car, settings)
      if (mode === 'company' || mode === 'employee') sources.push({ logId: car.number, car, data: getDriverCarWorkData(car, workDataByLogId) })
    })
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
      const supplier = getVehicleSupplierIdentity(source.car, settings)
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

        const fixedCount = parseInt(record?.fixedCount, 10) || 0
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

export function flattenLinkedDriverTrips(data, monthKey, link) {
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

export function getLinkedDriverClientInvoiceGroups(trips, car, ownerSettings) {
  const supplier = getVehicleSupplierIdentity(car, ownerSettings)
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

export function getTaxInvoiceFlowMeta(flow = 'sales') {
  const flows = {
    sales: { label: '매출 발행', partyHeading: '공급받는 자', itemName: '화물운송료', completeLabel: '발급 완료' },
    purchase: { label: '기사 매입', partyHeading: '공급자', itemName: '화물운송 용역', completeLabel: '수취 완료' },
    commission: { label: '수수료 발행', partyHeading: '공급받는 자', itemName: '운송 중개 수수료', completeLabel: '발급 완료' },
  }
  return flows[flow] || flows.sales
}

export function getTaxInvoiceRecordId(monthKey, partyKey, flow = 'sales') {
  return `${flow}|${monthKey}|${partyKey}`
}

export function getTaxInvoicePartyInfo(group, settings = {}) {
  if (group.partyType === 'client') {
    const client = (settings.clients || []).find((item) => item.companyName === group.clientName) || {}
    return {
      clientBizNumber: client.bizNumber || '',
      clientRepresentative: client.taxRepresentative || client.managerName || '',
      clientAddress: client.taxAddress || '',
      clientBizType: client.taxBizType || '',
      clientBizItem: client.taxBizItem || '',
      clientEmail: client.taxEmail || '',
    }
  }
  const car = (settings.cars || []).find((item) => item.number === group.carNumber) || {}
  const info = car.personalInfo || {}
  return {
    clientBizNumber: info.bizNumber || '',
    clientRepresentative: info.name || car.driverName || '',
    clientAddress: info.address || '',
    clientBizType: info.bizType || '',
    clientBizItem: info.bizItem || '',
    clientEmail: info.email || '',
    carNumber: car.number,
  }
}

export function buildTaxInvoiceEntry(group, monthKey, flow = 'sales', records = [], settings = {}) {
  const id = getTaxInvoiceRecordId(monthKey, group.partyKey, flow)
  const saved = (records || []).find((item) => item.id === id) || {}
  const meta = getTaxInvoiceFlowMeta(flow)
  return {
    ...getTaxInvoicePartyInfo(group, settings),
    itemName: meta.itemName,
    remark: `${parseInt(monthKey.slice(5, 7), 10)}월 ${meta.itemName}`,
    ...saved,
    ...group,
    id,
    flow,
    logId: group.carNumber || 'fleet',
    monthKey,
    status: saved.status || 'draft',
  }
}

export function getTaxInvoiceSupplierBiz(item, settings = {}) {
  if (item?.flow === 'sales' && item.supplierBiz) return item.supplierBiz
  return {
    name: settings.bizName || '',
    bizNumber: settings.bizNumber || '',
    representative: settings.bizRepresentative || settings.userName || '',
    address: settings.bizAddress || '',
    bizType: settings.bizType || '',
    bizItem: settings.bizItem || '',
    email: settings.bizEmail || '',
  }
}

export function listTaxInvoiceEntries(monthKey, flow, settings, workDataByLogId, records = []) {
  const sourceEntries = getTaxInvoiceSourceGroups(monthKey, flow, settings, workDataByLogId)
    .map((group) => buildTaxInvoiceEntry(group, monthKey, flow, records, settings))
  const storedIssued = (records || []).filter((item) => item.flow === flow && item.monthKey === monthKey && item.status === 'issued')
  const issuedById = new Map(storedIssued.map((item) => [item.id, item]))
  sourceEntries.forEach((item) => {
    if (item.status === 'issued') issuedById.set(item.id, item)
  })
  const issuedEntries = [...issuedById.values()]
  const draftEntries = sourceEntries.filter((item) => item.status !== 'issued')
  return { sourceEntries, draftEntries, issuedEntries }
}
