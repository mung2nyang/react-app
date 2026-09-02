// @ts-check
// 재감사 3차(FAIL 지적 4번) — 이번 diff가 건드린 프로덕션 JS 전체를 활성 typecheck
// 대상으로 만들라는 지시로 @ts-check를 붙였다.
import { getReceivableItems } from './finance.js'
import { markReceivableItemPaid, saveWorkData } from './workData.js'
import { resolveFixedUnitPrice } from '../domain/clients.js'
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

/**
 * @param {string} ownerKey
 * @param {WorkDataByLogId} nextWorkDataByLogId
 */
function persistSubLogChanges(ownerKey, nextWorkDataByLogId) {
  for (const logId of Object.keys(nextWorkDataByLogId)) {
    if (logId === 'main') continue
    const next = nextWorkDataByLogId[logId]
    if (!next) continue
    const prev = readOwnerLogWorkData(ownerKey, logId)
    if (JSON.stringify(prev) !== JSON.stringify(next)) commitLogWorkData(ownerKey, logId, next)
  }
}

/**
 * 미수 화면 쓰기 창구(8-B) — 로그인 메인은 commitMainDayLogToCloud/Map, 게스트·서브는 로컬.
 * @param {string} ownerKey
 * @param {WorkDataByLogId} nextWorkDataByLogId
 * @returns {Promise<{ ok: boolean, partial: boolean, toast: string|null }>}
 */
export async function persistReceivableWorkDataChange(ownerKey, nextWorkDataByLogId) {
  const previousMain = readOwnerWorkData(ownerKey)
  const nextMain = nextWorkDataByLogId.main || {}
  const mainDateKeys = changedDayLogDateKeys(previousMain, nextMain)

  if (mainDateKeys.length > 0 && shouldCommitDayLogToCloud(ownerKey, 'main')) {
    const cloudResult = mainDateKeys.length === 1
      ? await commitMainDayLogToCloud({
        ownerKey,
        logId: 'main',
        dateKey: mainDateKeys[0],
        previousData: previousMain,
        nextData: nextMain,
      })
      : await commitMainDayLogMapToCloud({
        ownerKey,
        logId: 'main',
        dateKeys: mainDateKeys,
        previousData: previousMain,
        nextData: nextMain,
      })

    if (cloudResult.cloud) {
      if (!cloudResult.ok) {
        const partial = 'partial' in cloudResult && cloudResult.partial === true
        return {
          ok: false,
          partial,
          toast: cloudResult.toast,
        }
      }
      persistSubLogChanges(ownerKey, nextWorkDataByLogId)
      return { ok: true, partial: false, toast: null }
    }
  }

  if (mainDateKeys.length > 0) saveWorkData(ownerKey, nextMain)
  persistSubLogChanges(ownerKey, nextWorkDataByLogId)
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
    const result = markReceivableItemPaid(next[item.logId] || {}, item.dateKey, item.detailId, paidAt)
    if (result.error) continue
    next = { ...next, [item.logId]: result.data }
  }
  return next
}
