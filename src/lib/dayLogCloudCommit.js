// @ts-check
// 슬라이스 D(2026-09-01): 로그인 사용자의 메인 차량 일지(날짜 저장·빈 날 삭제, 콜상세)를
// durable journal / fallback / unsafe overlay / tombstone / retryPendingDayWrites /
// syncWorkData 일괄 upsert에 맡기지 않고, 그 날짜 daily_logs(+transport_details)에
// 직접 1회 쓰고 성공했을 때만 Store를 갱신한다(Fail-Fast). 실패하면 Store/LS/durable을
// 더 쌓지 않고 지정 토스트만 돌려준다.
//
// 게스트·서브 일지·미동기화 메인 차량은 { cloud: false }를 돌려줘 호출부(useDayDraft)가
// 예전 로컬 경로(saveLogWorkDataWithTombstoneCheck)를 그대로 타게 한다.
/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {import('./outboxTypes.js').SessionCapture} SessionCapture */
import { supabase } from '../supabaseClient.js'
import { getState } from '../store/app-store.js'
import { commitWorkData } from '../store/commitHelpers.js'
import {
  assertCloudWriteReady,
  assertSessionStillCurrent,
  captureSession,
  getCloudUserId,
} from './cloudSession.js'
import { StaleSessionError } from './outboxErrors.js'
import { mainCarSupabaseId, shouldCommitDayLogToCloud } from './mainDayLogRouting.js'
import { parseEntityNumber } from './cloudStorage.js'
import { upsertDailyLog } from './syncWorkData.js'

const SAVE_FAIL_TOAST = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'
const SESSION_CHANGED_TOAST = '세션이 바뀌어 저장을 중단했습니다. 다시 로그인한 뒤 시도해 주세요.'

/** @param {number} successCount @param {number} failCount */
function partialFailToast(successCount, failCount) {
  return `일부만 저장되었습니다. (성공 ${successCount}건, 실패 ${failCount}건) 화면에 남은 항목을 다시 시도해 주세요.`
}

/** @param {string} ownerKey @returns {Map<string, number|string>} */
function clientIdByName(ownerKey) {
  const clients = getState().clients[ownerKey]
  const list = Array.isArray(clients) ? clients : []
  /** @type {Map<string, number|string>} */
  const map = new Map()
  for (const item of list) {
    if (item.supabaseId != null && item.companyName) map.set(item.companyName, item.supabaseId)
  }
  return map
}

/**
 * 그 날짜 transport_details를 서버 값과 맞춘다(전량 교체). syncWorkData.js의 루프 내용과 동일.
 * @param {string} userId @param {number|string} vehicleId @param {number|string} dailyLogId
 * @param {string} workDate @param {DayRecordLike} record @param {Map<string, number|string>} byName
 */
async function replaceTransportDetails(userId, vehicleId, dailyLogId, workDate, record, byName) {
  const { error: deleteError } = await supabase.from('transport_details').delete().eq('daily_log_id', dailyLogId)
  if (deleteError) throw deleteError
  const callDetails = Array.isArray(record?.callDetails) ? record.callDetails : []
  if (!callDetails.length) return
  const { error } = await supabase.from('transport_details').insert(callDetails.map((detail, index) => ({
    daily_log_id: dailyLogId,
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
  })))
  if (error) throw error
}

/**
 * 그 날짜 daily_logs + transport_details를 서버에서 삭제한다. 이미 없으면(0행) 성공(멱등).
 * @param {number|string} vehicleId @param {string} workDate
 */
async function deleteDayLogOnServer(vehicleId, workDate) {
  const { error: detailError } = await supabase.from('transport_details').delete().eq('vehicle_id', vehicleId).eq('work_date', workDate)
  if (detailError) throw detailError
  const { error } = await supabase.from('daily_logs').delete().eq('vehicle_id', vehicleId).eq('work_date', workDate)
  if (error) throw error
}

/**
 * @param {string} userId @param {number|string} vehicleId @param {string} ownerKey
 * @param {string} dateKey @param {Record<string, DayRecordLike>} previousData
 * @param {Record<string, DayRecordLike>} nextData @param {SessionCapture} captured
 */
async function writeDayKeyToServer(userId, vehicleId, ownerKey, dateKey, previousData, nextData, captured) {
  const hadBefore = !!previousData[dateKey]
  const record = nextData[dateKey]
  if (record) {
    const dailyLogId = await upsertDailyLog(userId, vehicleId, dateKey, record)
    assertSessionStillCurrent(captured)
    await replaceTransportDetails(userId, vehicleId, dailyLogId, dateKey, record, clientIdByName(ownerKey))
    assertSessionStillCurrent(captured)
  } else if (hadBefore) {
    await deleteDayLogOnServer(vehicleId, dateKey)
    assertSessionStillCurrent(captured)
  }
}

/**
 * @param {Record<string, DayRecordLike>} previousData
 * @param {Record<string, DayRecordLike>} nextData
 * @returns {string[]}
 */
export function changedDayLogDateKeys(previousData, nextData) {
  const keys = new Set([...Object.keys(previousData), ...Object.keys(nextData)])
  /** @type {string[]} */
  const changed = []
  for (const dateKey of keys) {
    const before = previousData[dateKey]
    const after = nextData[dateKey]
    if (before === after) continue
    if (JSON.stringify(before) !== JSON.stringify(after)) changed.push(dateKey)
  }
  return changed.sort()
}

/**
 * @param {{ ownerKey: string, logId: string, dateKey: string,
 *   previousData: Record<string, DayRecordLike>, nextData: Record<string, DayRecordLike> }} params
 * @returns {Promise<{ cloud: false } | { cloud: true, ok: boolean, toast: string|null }>}
 */
export async function commitMainDayLogToCloud({ ownerKey, logId, dateKey, previousData, nextData }) {
  if (!shouldCommitDayLogToCloud(ownerKey, logId)) return { cloud: false }
  const userId = /** @type {string} */ (getCloudUserId())
  const vehicleId = mainCarSupabaseId(ownerKey)
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
    commitWorkData(ownerKey, nextData, { syncToCloud: false })
    return { cloud: true, ok: true, toast: null }
  } catch (error) {
    if (error instanceof StaleSessionError) return { cloud: true, ok: false, toast: SESSION_CHANGED_TOAST }
    console.error('[commitMainDayLogToCloud] 일지 저장 실패:', error)
    return { cloud: true, ok: false, toast: SAVE_FAIL_TOAST }
  }
}

/**
 * 여러 dateKey를 순차 서버 커밋한다. 성공한 날짜만 Store에 부분 반영(8-B 일괄 미수).
 * @param {{ ownerKey: string, logId: string, dateKeys: string[],
 *   previousData: Record<string, DayRecordLike>, nextData: Record<string, DayRecordLike> }} params
 * @returns {Promise<{ cloud: false } | { cloud: true, ok: boolean, partial: boolean,
 *   appliedDateKeys: string[], failedDateKeys: string[], toast: string|null }>}
 */
export async function commitMainDayLogMapToCloud({ ownerKey, logId, dateKeys, previousData, nextData }) {
  if (!shouldCommitDayLogToCloud(ownerKey, logId)) return { cloud: false }
  const userId = /** @type {string} */ (getCloudUserId())
  const vehicleId = mainCarSupabaseId(ownerKey)
  if (vehicleId == null) return { cloud: false }

  try {
    assertCloudWriteReady()
  } catch {
    return { cloud: true, ok: false, partial: false, appliedDateKeys: [], failedDateKeys: [...dateKeys], toast: SAVE_FAIL_TOAST }
  }

  const captured = captureSession()
  const partialNext = { ...previousData }
  /** @type {string[]} */
  const appliedDateKeys = []
  let staleSession = false
  /** @type {unknown} */
  let firstError = null

  for (const dateKey of dateKeys) {
    try {
      await writeDayKeyToServer(userId, vehicleId, ownerKey, dateKey, previousData, nextData, captured)
      assertSessionStillCurrent(captured)
      if (nextData[dateKey]) partialNext[dateKey] = nextData[dateKey]
      else delete partialNext[dateKey]
      appliedDateKeys.push(dateKey)
    } catch (error) {
      if (error instanceof StaleSessionError) staleSession = true
      else if (!firstError) firstError = error
      break
    }
  }

  const failedDateKeys = dateKeys.filter((dateKey) => !appliedDateKeys.includes(dateKey))
  if (appliedDateKeys.length > 0) commitWorkData(ownerKey, partialNext, { syncToCloud: false })

  const ok = failedDateKeys.length === 0
  const partial = appliedDateKeys.length > 0 && failedDateKeys.length > 0
  /** @type {string|null} */
  let toast = null
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
