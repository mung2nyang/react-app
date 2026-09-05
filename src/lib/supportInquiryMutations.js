// @ts-check
// Step 10 5-2: 고객센터 1:1 문의 — 로컬 캐시 없이 support_inquiries에 insert 1회(Fail-Fast).
import { supabase } from '../supabaseClient.js'
import {
  assertCloudWriteReady,
  assertSessionStillCurrent,
  captureSession,
} from './cloudSession.js'
import { StaleSessionError } from './outboxErrors.js'

const SUCCESS_TOAST = '문의가 접수되었습니다.'
const SAVE_FAIL_TOAST = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'
const SESSION_CHANGED_TOAST = '세션이 바뀌어 저장을 중단했습니다. 다시 로그인한 뒤 시도해 주세요.'
const LOGIN_REQUIRED_TOAST = '로그인이 필요합니다.'

/**
 * @param {{ userId?: string|null, type: string, title: string, content: string }} params
 * @returns {Promise<{ ok: boolean, toast: string }>}
 */
export async function requestSupportInquirySave({ userId, type, title, content }) {
  if (!userId) return { ok: false, toast: LOGIN_REQUIRED_TOAST }

  try {
    assertCloudWriteReady()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return { ok: false, toast: msg }
  }

  const captured = captureSession()
  try {
    const { error } = await supabase.from('support_inquiries').insert({
      user_id: userId,
      type,
      title,
      content,
      status: 'open',
    })
    assertSessionStillCurrent(captured)
    if (error) throw error
    return { ok: true, toast: SUCCESS_TOAST }
  } catch (error) {
    if (error instanceof StaleSessionError) {
      return { ok: false, toast: SESSION_CHANGED_TOAST }
    }
    console.error('[requestSupportInquirySave] 저장 실패:', error)
    return { ok: false, toast: SAVE_FAIL_TOAST }
  }
}
