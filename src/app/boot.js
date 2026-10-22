// @ts-check
// 새로고침 시 Supabase 세션을 복원하는 흐름만 — 세션 만들기(소속기사 판정·ownerKey)는 data/cloud/appSession.ts.
import { supabase } from '../data/cloud/supabaseClient.ts'
import { hydrateFromSupabase } from '../data/hydrate/hydrate.ts'
import { singleFlight } from '../data/cloud/singleFlight.ts'
import { LINK_RETRY_MS, buildBootSession, isProfileRowMissing, ownerKeyFromSession } from '../data/cloud/appSession.ts'

/** @typedef {import('../data/sync/syncTypes.ts').AppSession} AppSession */

/**
 * needsProfile: 내 profiles 행이 없어 홈 대신 기본 정보 화면(/welcome)으로 보내야 함.
 * linkCheckFailed: 연동 확인이 두 번 다 실패 — 어느 칸으로 들어갈지 몰라 안내 화면.
 * @param {number} [retryMs] 테스트용으로만 바꿈
 * @returns {Promise<{ session: AppSession, hydrateError: boolean, needsProfile: boolean } | { linkCheckFailed: true } | null>}
 */
export function restoreSessionOnBoot(retryMs = LINK_RETRY_MS) {
  return singleFlight('boot:restoreSession', () => performRestoreSessionOnBoot(retryMs))
}

/** @param {number} retryMs */
async function performRestoreSessionOnBoot(retryMs) {
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
  const session = await buildBootSession(userId, {
    name: authUser.user_metadata?.name || '',
    phone: authUser.phone || '',
  }, retryMs)
  if (!session) return { linkCheckFailed: /** @type {const} */ (true) }
  if (!session.name) session.name = authUser.user_metadata?.name || ''
  if (!session.phone) session.phone = authUser.phone || ''

  const needsProfile = await isProfileRowMissing(userId)
  const ownerKey = ownerKeyFromSession(session)
  try {
    await hydrateFromSupabase(userId, ownerKey, { employedDriver: !!session.linkedOwnerId })
    return { session, hydrateError: false, needsProfile }
  } catch (error) {
    console.error('[boot] hydrate 실패, 로컬 데이터로 계속합니다.', error)
    return { session, hydrateError: true, needsProfile }
  }
}
