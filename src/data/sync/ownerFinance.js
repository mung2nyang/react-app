// @ts-check
import { getReceivableItems } from '../../lib/finance.js'
import { markReceivableItemPaid, saveWorkData } from '../../lib/workData.js'
import { resolveFixedUnitPrice } from '../../domain/clients.js'
import { commitLogWorkData } from '../store/commitHelpers.js'
import {
  readOwnerCars,
  readOwnerClients,
  readOwnerDrivers,
  readOwnerLogWorkData,
  readOwnerProfile,
  readOwnerSettings,
  readOwnerWorkData,
  readOwnerWorkDataByLogId,
} from '../store/ownerDataHooks.js'
import {
  changedDayLogDateKeys,
  commitMainDayLogMapToCloud,
  commitMainDayLogToCloud,
} from './dayLogCloudCommit.js'
import { shouldCommitDayLogToCloud } from './mainDayLogRouting.js'
import { SESSION_CHANGED_FAIL } from '../../lib/failureMessages.js'

/** @typedef {import('../../domain/day-record.js').DayRecordLike} DayRecordLike */
// WorkDataByLogId의 정본은 domain/financeTypes.js다 — alias만 한다(중복 선언 금지).
/** @typedef {import('../../domain/financeTypes.js').WorkDataByLogId} WorkDataByLogId */

/**
 * @param {string} [ownerKey]
 * @returns {WorkDataByLogId}
 */
export function loadWorkDataByLogId(ownerKey = 'guest') {
  return readOwnerWorkDataByLogId(ownerKey)
}

const SESSION_CHANGED_TOAST = SESSION_CHANGED_FAIL

/**
 * 한 차량 일지의 바뀐 날짜를 서버(있으면) 또는 기기에 저장한다.
 * @param {string} ownerKey @param {string} logId @param {Record<string, DayRecordLike>} previous @param {Record<string, DayRecordLike>} next @param {string[]} dateKeys
 * @returns {Promise<{ ok: boolean, applied: number, toast: string|null }>}
 */
async function persistLogChange(ownerKey, logId, previous, next, dateKeys) {
  if (shouldCommitDayLogToCloud(ownerKey, logId)) {
    if (dateKeys.length === 1) {
      const one = await commitMainDayLogToCloud({ ownerKey, logId, dateKey: dateKeys[0], previousData: previous, nextData: next })
      if (one.cloud) return { ok: one.ok, applied: one.ok ? 1 : 0, toast: one.toast }
    } else {
      const many = await commitMainDayLogMapToCloud({ ownerKey, logId, dateKeys, previousData: previous, nextData: next })
      if (many.cloud) return { ok: many.ok, applied: many.appliedDateKeys.length, toast: many.toast }
    }
  }
  if (logId === 'main') saveWorkData(ownerKey, next)
  else commitLogWorkData(ownerKey, logId, next)
  return { ok: true, applied: dateKeys.length, toast: null }
}

/**
 * 미수 화면 쓰기 창구(8-B).
 * @param {string} ownerKey
 * @param {WorkDataByLogId} nextWorkDataByLogId
 * @returns {Promise<{ ok: boolean, partial: boolean, toast: string|null }>}
 */
export async function persistReceivableWorkDataChange(ownerKey, nextWorkDataByLogId) {
  // 차량마다(메인 → 기사 차량) 서버에 있으면 서버 저장, 없으면 기기 저장. 실패한 차량에서 멈춘다.
  const logIds = ['main', ...Object.keys(nextWorkDataByLogId).filter((logId) => logId !== 'main')]
  const changes = logIds.flatMap((logId) => {
    const next = nextWorkDataByLogId[logId]
    if (!next) return []
    const previous = logId === 'main' ? readOwnerWorkData(ownerKey) : readOwnerLogWorkData(ownerKey, logId)
    const dateKeys = changedDayLogDateKeys(previous, next)
    return dateKeys.length ? [{ logId, previous, next, dateKeys }] : []
  })
  const total = changes.reduce((sum, change) => sum + change.dateKeys.length, 0)
  let applied = 0
  for (const { logId, previous, next, dateKeys } of changes) {
    const result = await persistLogChange(ownerKey, logId, previous, next, dateKeys)
    applied += result.applied
    if (result.ok) continue
    if (applied === 0 || result.toast === SESSION_CHANGED_TOAST) return { ok: false, partial: applied > 0, toast: result.toast }
    return {
      ok: false,
      partial: true,
      toast: `일부만 저장되었습니다. (성공 ${applied}건, 실패 ${total - applied}건) 화면에 남은 항목을 다시 시도해 주세요.`,
    }
  }
  return { ok: true, partial: false, toast: null }
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
 * @param {string} detailId
 * @param {(store: Record<string, DayRecordLike>, dateKey: string, detailId: string) => { error?: string, data?: Record<string, DayRecordLike> }} apply
 */
export function patchWorkLog(workDataByLogId, logId, dateKey, detailId, apply) {
  const store = workDataByLogId[logId] || {}
  const result = apply(store, dateKey, detailId)
  if (result.error || !result.data) return { error: result.error, workDataByLogId }
  return { workDataByLogId: { ...workDataByLogId, [logId]: result.data } }
}

/**
 * @param {WorkDataByLogId} workDataByLogId
 * @param {import('../../domain/financeTypes.js').FinanceSettings} settings
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
    const result = markReceivableItemPaid(next[item.logId] || {}, item.dateKey, item.detailId, paidAt)
    if (result.error) continue
    next = { ...next, [item.logId]: result.data }
  }
  return next
}
