// @ts-check
// 회원탈퇴: delete_own_account RPC만 호출. 세션 정리·이동은 호출부가 onGoAuth로 처리.
import { supabase } from '../supabaseClient.js'

const SUCCESS_TOAST = '탈퇴가 완료되었습니다.'
const FAIL_TOAST = '탈퇴 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'

/**
 * @returns {Promise<{ ok: boolean, toast: string }>}
 */
export async function requestAccountWithdrawal() {
  try {
    const { error } = await supabase.rpc('delete_own_account')
    if (error) throw error
    return { ok: true, toast: SUCCESS_TOAST }
  } catch (error) {
    console.error('[requestAccountWithdrawal] 실패:', error)
    const msg = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : ''
    return { ok: false, toast: msg || FAIL_TOAST }
  }
}
