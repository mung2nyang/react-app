// 로그인 일지는 durable/retry 없이 그 날짜 daily_logs(+transport_details)에 직접 1회 쓰고 성공 때만 Store 반영(Fail-Fast). 게스트·미동기화는 { cloud: false }로 로컬 경로.
// §6: 단건/복수건 커밋이 헬퍼 4개(writeDayKeyToServer 등)를 공유하는 응집 단위. 빈 날 서버 삭제 규칙은 dailyLogRemoval.ts.
import type { DayRecordLike } from '../../domain/dayRecordTypes.ts'
import type { SessionCapture } from './syncTypes.ts'
import { supabase } from '../cloud/supabaseClient.ts'
import { getState } from '../store/app-store.ts'
import { commitLogWorkData } from '../store/commitHelpers.ts'
import {
  assertCloudWriteReady,
  assertSessionStillCurrent,
  captureSession,
  getCloudUserId,
  isSessionStillCurrent,
} from '../cloud/cloudSession.ts'
import { StaleSessionError } from './saveErrors.ts'
import { shouldCommitDayLogToCloud, vehicleSupabaseIdForLog } from './mainDayLogRouting.ts'
import { parseEntityNumber } from '../cloud/cloudStorage.ts'
import { removeDayLogOnServer } from './dailyLogRemoval.ts'
import { dailyLogRow } from './syncWorkData.ts'
import { SERVER_SAVE_FAIL, SESSION_CHANGED_FAIL } from '../../shared/utils/failureMessages.js'

const SAVE_FAIL_TOAST = SERVER_SAVE_FAIL
const SESSION_CHANGED_TOAST = SESSION_CHANGED_FAIL

function partialFailToast(successCount: number, failCount: number) {
  return `일부만 저장되었습니다. (성공 ${successCount}건, 실패 ${failCount}건) 화면에 남은 항목을 다시 시도해 주세요.`
}

function clientIdByName(ownerKey: string): Map<string, number | string> {
  const clients = getState().clients[ownerKey]
  const list = Array.isArray(clients) ? clients : []
  const map: Map<string, number | string> = new Map()
  for (const item of list) {
    if (item.supabaseId != null && item.companyName) map.set(item.companyName, item.supabaseId)
  }
  return map
}

/** 그 날짜 transport_details에 넣을 줄(서버가 전량 교체). */
function transportDetailRows(userId: string, vehicleId: number | string, workDate: string, record: DayRecordLike, byName: Map<string, number | string>) {
  const callDetails = Array.isArray(record?.callDetails) ? record.callDetails : []
  return callDetails.map((detail, index) => ({
    user_id: userId,
    vehicle_id: vehicleId,
    client_id: byName.get(detail?.client || '') || null,
    work_date: workDate,
    sequence: index,
    load_loc: detail?.loadLoc || null,
    unload_loc: detail?.unloadLoc || null,
    fare_amount: parseEntityNumber(detail?.fare),
    vat_exempt: !!detail?.vatExempt,
    payment_status: detail?.paymentStatus || '미수',
    payment_due_date: detail?.paymentDueDate || null,
    payments: Array.isArray(detail?.payments) ? detail.payments : [],
    commission_snapshot: detail?.commissionSnapshot || null,
    raw: detail,
  }))
}

async function writeDayKeyToServer(userId: string, vehicleId: number | string, ownerKey: string, dateKey: string, previousData: Record<string, DayRecordLike>, nextData: Record<string, DayRecordLike>, captured: SessionCapture) {
  const hadBefore = !!previousData[dateKey]
  const record = nextData[dateKey]
  if (record) {
    // 하루 기록 줄과 콜 상세를 서버 함수 한 번으로 — 하나가 실패하면 둘 다 저장 전 그대로.
    const { error } = await supabase.rpc('save_day_log', {
      p_log: dailyLogRow(userId, vehicleId, dateKey, record),
      p_rows: transportDetailRows(userId, vehicleId, dateKey, record, clientIdByName(ownerKey)),
    })
    if (error) throw error
    assertSessionStillCurrent(captured)
  } else if (hadBefore) {
    await removeDayLogOnServer(vehicleId, dateKey)
    assertSessionStillCurrent(captured)
  }
}

export function changedDayLogDateKeys(previousData: Record<string, DayRecordLike>, nextData: Record<string, DayRecordLike>): string[] {
  const keys = new Set([...Object.keys(previousData), ...Object.keys(nextData)])
  const changed: string[] = []
  for (const dateKey of keys) {
    const before = previousData[dateKey]
    const after = nextData[dateKey]
    if (before === after) continue
    if (JSON.stringify(before) !== JSON.stringify(after)) changed.push(dateKey)
  }
  return changed.sort()
}

export async function commitMainDayLogToCloud({ ownerKey, logId, dateKey, previousData, nextData }: { ownerKey: string, logId: string, dateKey: string,
  previousData: Record<string, DayRecordLike>, nextData: Record<string, DayRecordLike> }): Promise<{ cloud: false } | { cloud: true, ok: boolean, toast: string | null }> {
  if (!shouldCommitDayLogToCloud(ownerKey, logId)) return { cloud: false }
  const userId = (getCloudUserId()) as string
  const vehicleId = vehicleSupabaseIdForLog(ownerKey, logId)
  if (vehicleId == null) return { cloud: false }

  try {
    assertCloudWriteReady()
  } catch {
    return { cloud: true, ok: false, toast: SAVE_FAIL_TOAST }
  }

  const captured = captureSession()
  try {
    await writeDayKeyToServer(userId, vehicleId, ownerKey, dateKey, previousData, nextData, captured)
    assertSessionStillCurrent(captured)
    commitLogWorkData(ownerKey, logId, nextData)
    return { cloud: true, ok: true, toast: null }
  } catch (error) {
    if (error instanceof StaleSessionError) return { cloud: true, ok: false, toast: SESSION_CHANGED_TOAST }
    console.error('[commitMainDayLogToCloud] 일지 저장 실패:', error)
    return { cloud: true, ok: false, toast: SAVE_FAIL_TOAST }
  }
}

/** 여러 dateKey를 순차 서버 커밋한다. 성공한 날짜만 Store에 부분 반영(8-B 일괄 미수). */
export async function commitMainDayLogMapToCloud({ ownerKey, logId, dateKeys, previousData, nextData }: { ownerKey: string, logId: string, dateKeys: string[],
  previousData: Record<string, DayRecordLike>, nextData: Record<string, DayRecordLike> }): Promise<{ cloud: false } | { cloud: true, ok: boolean, partial: boolean,
  appliedDateKeys: string[], failedDateKeys: string[], toast: string | null }> {
  if (!shouldCommitDayLogToCloud(ownerKey, logId)) return { cloud: false }
  const userId = (getCloudUserId()) as string
  const vehicleId = vehicleSupabaseIdForLog(ownerKey, logId)
  if (vehicleId == null) return { cloud: false }

  try {
    assertCloudWriteReady()
  } catch {
    return { cloud: true, ok: false, partial: false, appliedDateKeys: [], failedDateKeys: [...dateKeys], toast: SAVE_FAIL_TOAST }
  }

  const captured = captureSession()
  const partialNext = { ...previousData }
  const appliedDateKeys: string[] = []
  let staleSession = false
  let firstError: Error | null = null

  for (const dateKey of dateKeys) {
    try {
      await writeDayKeyToServer(userId, vehicleId, ownerKey, dateKey, previousData, nextData, captured)
      assertSessionStillCurrent(captured)
      if (nextData[dateKey]) partialNext[dateKey] = nextData[dateKey]
      else delete partialNext[dateKey]
      appliedDateKeys.push(dateKey)
    } catch (error) {
      if (error instanceof StaleSessionError) staleSession = true
      else if (!firstError) firstError = error instanceof Error ? error : new Error(String(error))
      break
    }
  }

  const failedDateKeys = dateKeys.filter((dateKey) => !appliedDateKeys.includes(dateKey))
  // 세션이 바뀌었으면 반영하지 않는다 — 이전 계정 일지가 화면·기기에 남지 않게.
  if (appliedDateKeys.length > 0 && isSessionStillCurrent(captured)) commitLogWorkData(ownerKey, logId, partialNext)

  const ok = failedDateKeys.length === 0
  const partial = appliedDateKeys.length > 0 && failedDateKeys.length > 0
  let toast: string | null = null
  if (!ok) {
    if (staleSession) toast = SESSION_CHANGED_TOAST
    else if (partial) toast = partialFailToast(appliedDateKeys.length, failedDateKeys.length)
    else {
      console.error('[commitMainDayLogMapToCloud] 일지 저장 실패:', firstError)
      toast = SAVE_FAIL_TOAST
    }
  }

  return { cloud: true, ok, partial, appliedDateKeys, failedDateKeys, toast }
}
