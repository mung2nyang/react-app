// @ts-check
// 로드맵 7-C: 연동 해제는 양쪽 동의 또는 요청 후 3일 — 서버 함수만 호출하고, 성공했을 때만 기사 목록(store)을 갱신한다.
import { supabase } from '../supabaseClient.js'
import { assertSessionStillCurrent, blockedReasonForCloudWrite, captureSession } from './cloudSession.js'
import { StaleSessionError } from './outboxErrors.js'
import { commitDrivers } from '../store/commitHelpers.js'

/** @typedef {import('./outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {'request'|'consent'|'cancel'} UnlinkAction */

export const UNLINK_WAIT_DAYS = 3
const SAVE_FAIL_TOAST = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'
const SESSION_CHANGED_TOAST = '세션이 바뀌어 저장을 중단했습니다. 다시 로그인한 뒤 시도해 주세요.'
const RPC = { request: 'request_driver_unlink', consent: 'consent_driver_unlink', cancel: 'cancel_driver_unlink' }
const DISCONNECTED_TOAST = '연동을 해제했습니다.'
const REQUESTED_TOAST = '해제 요청을 보냈습니다. 상대가 동의하거나 3일이 지나면 해제됩니다.'
const CANCELED_TOAST = '해제 요청을 취소했습니다.'

/**
 * 해제 요청 시각 + 3일 = 자동 해제 날짜("M월 D일"). 요청이 없으면 빈 문자열.
 * @param {string|undefined} requestedAt
 */
export function unlinkAutoDateLabel(requestedAt) {
  const time = Date.parse(String(requestedAt || ''))
  if (Number.isNaN(time)) return ''
  const due = new Date(time + UNLINK_WAIT_DAYS * 24 * 60 * 60 * 1000)
  return `${due.getMonth() + 1}월 ${due.getDate()}일`
}

/** 내 연동 중 요청 후 3일 지난 해제 요청을 서버가 해제한다. 실패해도 앱 시작·불러오기는 막지 않는다. */
export async function settleExpiredDriverUnlinks() {
  try {
    const settled = await supabase.rpc('settle_expired_driver_unlinks')
    if (settled.error) console.error('[settleExpiredDriverUnlinks] 기한 지난 해제 요청 처리 실패:', settled.error)
  } catch (error) {
    console.error('[settleExpiredDriverUnlinks] 기한 지난 해제 요청 처리 실패:', error)
  }
}

/**
 * 차주 불러오기용: 기한(3일) 지난 해제 요청을 먼저 처리한 뒤 연동 목록을 읽는다.
 * @param {string} userId
 */
export async function fetchOwnerDriverLinks(userId) {
  await settleExpiredDriverUnlinks()
  return supabase.from('driver_links').select('*').eq('owner_id', userId)
}

/** @param {UnlinkAction} action @param {string} status */
function successToast(action, status) {
  if (status === 'disconnected') return DISCONNECTED_TOAST
  return action === 'cancel' ? CANCELED_TOAST : REQUESTED_TOAST
}

/**
 * 해제 요청·동의·요청 취소. 해제가 확정되면 목록에서 빼고, 아니면 요청 칸만 갱신한다.
 * @param {{ ownerKey: string, drivers: Array<DriverRecord>, driverId: string, action: UnlinkAction }} params
 * @returns {Promise<{ drivers: Array<DriverRecord>, toast: string, failed: boolean }>}
 */
export async function requestDriverUnlinkAction({ ownerKey, drivers, driverId, action }) {
  const driver = drivers.find((item) => item.id === driverId)
  if (!driver?.supabaseId) return { drivers, toast: SAVE_FAIL_TOAST, failed: true }
  const blocked = blockedReasonForCloudWrite(driver.supabaseId)
  if (blocked) return { drivers, toast: blocked, failed: true }
  const captured = captureSession()
  try {
    const { data, error } = await supabase.rpc(RPC[action], { p_link_id: driver.supabaseId })
    assertSessionStillCurrent(captured)
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : null
    const status = String(row?.status || '')
    const next = status === 'disconnected'
      ? drivers.filter((item) => item.id !== driverId)
      : drivers.map((item) => (item.id === driverId
        ? { ...item, unlinkRequestedBy: row?.unlink_requested_by || '', unlinkRequestedAt: row?.unlink_requested_at || '' }
        : item))
    commitDrivers(ownerKey, next, { syncToCloud: false })
    return { drivers: next, toast: successToast(action, status), failed: false }
  } catch (error) {
    if (error instanceof StaleSessionError) return { drivers, toast: SESSION_CHANGED_TOAST, failed: true }
    console.error('[requestDriverUnlinkAction] 실패:', error)
    const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : ''
    return { drivers, toast: message || SAVE_FAIL_TOAST, failed: true }
  }
}
