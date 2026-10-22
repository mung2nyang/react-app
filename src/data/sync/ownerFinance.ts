import { getReceivableItems } from '../../domain/finance.ts'
import { saveWorkData } from './workDataSave.ts'
import { markReceivableItemPaid } from '../../domain/payments.ts'
import { resolveFixedUnitPrice } from '../../domain/clients.ts'
import { commitLogWorkData } from '../store/commitHelpers.ts'
import {
  readOwnerCars,
  readOwnerClients,
  readOwnerDrivers,
  readOwnerLogWorkData,
  readOwnerProfile,
  readOwnerSettings,
  readOwnerWorkData,
  readOwnerWorkDataByLogId,
} from '../store/ownerDataHooks.ts'
import {
  changedDayLogDateKeys,
  commitMainDayLogMapToCloud,
  commitMainDayLogToCloud,
} from './dayLogCloudCommit.ts'
import { shouldCommitDayLogToCloud } from './mainDayLogRouting.ts'
import { SESSION_CHANGED_FAIL } from '../../shared/utils/failureMessages.js'
import type { DayRecordLike } from '../../domain/day-record.ts'
// WorkDataByLogId의 정본은 domain/financeTypes.ts다 — alias만 한다(중복 선언 금지).
import type { FinanceSettings, WorkDataByLogId } from '../../domain/financeTypes.ts'

export function loadWorkDataByLogId(ownerKey = 'guest'): WorkDataByLogId {
  return readOwnerWorkDataByLogId(ownerKey)
}

const SESSION_CHANGED_TOAST = SESSION_CHANGED_FAIL

/** 한 차량 일지의 바뀐 날짜를 서버(있으면) 또는 기기에 저장한다. */
async function persistLogChange(ownerKey: string, logId: string, previous: Record<string, DayRecordLike>, next: Record<string, DayRecordLike>, dateKeys: string[]): Promise<{ ok: boolean, applied: number, toast: string | null }> {
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

/** 미수 화면 쓰기 창구(8-B). */
export async function persistReceivableWorkDataChange(ownerKey: string, nextWorkDataByLogId: WorkDataByLogId): Promise<{ ok: boolean, partial: boolean, toast: string | null }> {
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

export function patchWorkLog(workDataByLogId: WorkDataByLogId, logId: string, dateKey: string, detailId: string, apply: (store: Record<string, DayRecordLike>, dateKey: string, detailId: string) => { error?: string, data?: Record<string, DayRecordLike> }) {
  const store = workDataByLogId[logId] || {}
  const result = apply(store, dateKey, detailId)
  if (result.error || !result.data) return { error: result.error, workDataByLogId }
  return { workDataByLogId: { ...workDataByLogId, [logId]: result.data } }
}

export function markMonthlyReceivablesPaid(workDataByLogId: WorkDataByLogId, settings: FinanceSettings, clientName: string, monthKey: string, paidAt: Date = new Date()) {
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
