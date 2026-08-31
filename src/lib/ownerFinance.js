// @ts-check
// 재감사 3차(FAIL 지적 4번) — 이번 diff가 건드린 프로덕션 JS 전체를 활성 typecheck
// 대상으로 만들라는 지시로 @ts-check를 붙였다.
import { getReceivableItems } from './finance.js'
import { markReceivableItemPaid, saveWorkData } from './workData.js'
import { resolveFixedUnitPrice } from '../domain/clients.js'
import {
  readOwnerCars,
  readOwnerClients,
  readOwnerDrivers,
  readOwnerProfile,
  readOwnerSettings,
  readOwnerWorkDataByLogId,
} from '../store/ownerDataHooks.js'

/** @typedef {import('../domain/day-record.js').DayRecordLike} DayRecordLike */
// WorkDataByLogId의 정본은 domain/financeTypes.js다 — alias만 한다(중복 선언 금지).
/** @typedef {import('../domain/financeTypes.js').WorkDataByLogId} WorkDataByLogId */

/**
 * @param {string} [ownerKey]
 * @returns {WorkDataByLogId}
 */
export function loadWorkDataByLogId(ownerKey = 'guest') {
  return readOwnerWorkDataByLogId(ownerKey)
}

/**
 * @param {string} ownerKey
 * @param {WorkDataByLogId} workDataByLogId
 */
export function persistWorkDataByLogId(ownerKey, workDataByLogId) {
  saveWorkData(ownerKey, workDataByLogId.main || {})
}

/** @param {string} [ownerKey] */
export function buildFinanceSettings(ownerKey = 'guest') {
  const practice = readOwnerSettings(ownerKey)
  const profile = readOwnerProfile(ownerKey)
  const drivers = readOwnerDrivers(ownerKey)
  const clients = readOwnerClients(ownerKey)
  return {
    paymentOn: true,
    subPaymentOn: true,
    fixedOn: practice.fixedOn,
    subFixedOn: practice.subFixedOn,
    unitPrice: resolveFixedUnitPrice({ clients }),
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
    clients,
    cars: readOwnerCars(ownerKey),
    driverLinks: drivers.map((driver) => ({
      id: driver.id,
      vehicleNumber: driver.vehicleNumber,
      assignmentStart: driver.startDate,
      assignmentEnd: driver.endDate,
      status: driver.status,
    })),
  }
}

/**
 * @param {WorkDataByLogId} workDataByLogId
 * @param {string} logId
 * @param {string} dateKey
 * @param {number} detailIndex
 * @param {(store: Record<string, DayRecordLike>, dateKey: string, detailIndex: number) => { error?: string, data?: Record<string, DayRecordLike> }} apply
 */
export function patchWorkLog(workDataByLogId, logId, dateKey, detailIndex, apply) {
  const store = workDataByLogId[logId] || {}
  const result = apply(store, dateKey, detailIndex)
  if (result.error || !result.data) return { error: result.error, workDataByLogId }
  return { workDataByLogId: { ...workDataByLogId, [logId]: result.data } }
}

/**
 * @param {WorkDataByLogId} workDataByLogId
 * @param {import('../domain/financeTypes.js').FinanceSettings} settings
 * @param {string} clientName
 * @param {string} monthKey
 * @param {Date} [paidAt]
 */
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
