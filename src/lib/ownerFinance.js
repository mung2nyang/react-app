import { loadCars } from './cars.js'
import { loadClients } from './clients.js'
import { loadDrivers } from './drivers.js'
import { getReceivableItems } from './finance.js'
import { loadPracticeSettings } from './practiceSettings.js'
import { loadProfile } from './profile.js'
import { loadWorkData, markReceivableItemPaid, saveWorkData } from './workData.js'

export function loadWorkDataByLogId(ownerKey = 'guest') {
  return { main: loadWorkData(ownerKey) }
}

export function persistWorkDataByLogId(ownerKey, workDataByLogId) {
  saveWorkData(ownerKey, workDataByLogId.main || {})
}

export function buildFinanceSettings(ownerKey = 'guest') {
  const practice = loadPracticeSettings(ownerKey)
  const profile = loadProfile(ownerKey)
  const drivers = loadDrivers(ownerKey)
  return {
    paymentOn: true,
    subPaymentOn: true,
    fixedOn: practice.fixedOn,
    subFixedOn: practice.subFixedOn,
    defaultDriverSettlementMode: 'company',
    driverInvoiceBasis: 'net',
    bizName: profile.bizName,
    bizNumber: profile.bizNumber,
    bizRepresentative: profile.bizRepresentative,
    userName: profile.bizRepresentative || profile.name,
    bizAddress: profile.bizAddress,
    bizType: profile.bizType,
    bizItem: profile.bizItem,
    bizEmail: profile.bizEmail,
    clients: loadClients(ownerKey),
    cars: loadCars(ownerKey),
    driverLinks: drivers.map((driver) => ({
      id: driver.id,
      vehicleNumber: driver.vehicleNumber,
      assignmentStart: driver.startDate,
      assignmentEnd: driver.endDate,
      status: driver.status,
    })),
  }
}

export function patchWorkLog(workDataByLogId, logId, dateKey, detailIndex, apply) {
  const store = workDataByLogId[logId] || {}
  const result = apply(store, dateKey, detailIndex)
  if (result.error) return { error: result.error, workDataByLogId }
  return { workDataByLogId: { ...workDataByLogId, [logId]: result.data } }
}

export function markMonthlyReceivablesPaid(workDataByLogId, settings, clientName, monthKey, paidAt = new Date()) {
  const targets = getReceivableItems(settings, workDataByLogId).filter((item) => (
    item.client === clientName && item.workDate.slice(0, 7) === monthKey
  ))

  let next = workDataByLogId
  for (const item of targets) {
    const result = markReceivableItemPaid(next[item.logId] || {}, item.dateKey, item.detailIndex, paidAt)
    if (result.error) continue
    next = { ...next, [item.logId]: result.data }
  }
  return next
}
