// Step 2 부트 시퀀스: 새로고침 시 Supabase 세션을 복원한다 (migration-audit-plan.md Step 2,
// migration-plan.md 3.11 "부트"). React 없이 순수 async 함수로 두고 App.jsx가 마운트 시
// 한 번만 부른다. 로그인 상태가 아니면 null을 돌려줘 기존처럼 screen='auth'로 남는다 —
// 게스트/로그아웃 동작은 전혀 바꾸지 않는다.
import { supabase } from '../supabaseClient.js'
import { hydrateFromSupabase } from '../lib/cloudSync.js'

/**
 * @typedef {Object} RestoredSession
 * @property {string} userId
 * @property {string} name
 * @property {string} phone
 * @property {string} accountType
 * @property {boolean} guestMode
 */

/**
 * @param {string} userId
 * @returns {Promise<{ name: string, phone: string, accountType: string }>}
 */
async function fetchAccountProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('name, phone, account_type')
      .eq('id', userId)
      .maybeSingle()
    if (error || !data) return { name: '', phone: '', accountType: '' }
    return {
      name: data.name || '',
      phone: data.phone || '',
      accountType: data.account_type || '',
    }
  } catch (error) {
    console.warn('[boot] profiles 조회 실패, 세션은 복원하되 이름/유형은 비웁니다.', error)
    return { name: '', phone: '', accountType: '' }
  }
}

/**
 * @returns {Promise<{ session: RestoredSession, hydrateError: boolean } | null>}
 *   활성 Supabase 세션이 없으면 null. 있으면 세션 정보 + hydrate 성공 여부.
 *   hydrate가 실패해도 세션 자체는 돌려준다 — App.jsx가 로그인은 유지한 채 토스트만 띄운다.
 */
export async function restoreSessionOnBoot() {
  let authUser
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error || !data?.session?.user) return null
    authUser = data.session.user
  } catch (error) {
    console.error('[boot] 세션 복원 실패:', error)
    return null
  }

  const userId = authUser.id
  const profile = await fetchAccountProfile(userId)
  const session = {
    userId,
    name: profile.name || authUser.user_metadata?.name || '',
    phone: profile.phone || authUser.phone || '',
    accountType: profile.accountType || 'owner_driver',
    guestMode: false,
  }

  try {
    await hydrateFromSupabase(userId, userId)
    return { session, hydrateError: false }
  } catch (error) {
    console.error('[boot] hydrate 실패, 로컬 데이터로 계속합니다.', error)
    return { session, hydrateError: true }
  }
}
