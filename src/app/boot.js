// @ts-check
// Step 2 부트 시퀀스: 새로고침 시 Supabase 세션을 복원한다.
// 슬라이스 E(소속기사): linked driver_links가 있으면 accountType=employed_driver,
// linkedOwnerId로 hydrate ownerKey를 잡는다.
import { supabase } from '../supabaseClient.js'
import { hydrateFromSupabase } from '../lib/hydrate.js'
import { singleFlight } from '../lib/singleFlight.js'
import { fetchLinkedDriverLink } from '../lib/driverLinkRpc.js'

/** @typedef {import('../lib/outboxTypes.js').AppSession} AppSession */

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
 * 프로필 + driver_links linked 행으로 AppSession을 만든다.
 * @param {string} userId
 * @param {{ name?: string, phone?: string }} [overrides]
 * @returns {Promise<AppSession>}
 */
export async function buildCloudAppSession(userId, overrides = {}) {
  const profile = await fetchAccountProfile(userId)
  const link = await fetchLinkedDriverLink(userId)
  const linkedOwnerId = link?.owner_id ? String(link.owner_id) : null
  return {
    userId,
    name: overrides.name || profile.name || '',
    phone: overrides.phone || profile.phone || '',
    accountType: linkedOwnerId ? 'employed_driver' : (profile.accountType || 'owner_driver'),
    linkedOwnerId,
    guestMode: false,
  }
}

/**
 * @param {import('../lib/outboxTypes.js').AppSession|null|undefined} session
 * @returns {string}
 */
export function ownerKeyFromSession(session) {
  if (session?.linkedOwnerId) return session.linkedOwnerId
  if (session?.userId) return session.userId
  if (session?.guestMode) return 'guest'
  return session?.phone || 'guest'
}

/**
 * @returns {Promise<{ session: AppSession, hydrateError: boolean } | null>}
 */
export function restoreSessionOnBoot() {
  return singleFlight('boot:restoreSession', performRestoreSessionOnBoot)
}

async function performRestoreSessionOnBoot() {
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
  const session = await buildCloudAppSession(userId, {
    name: authUser.user_metadata?.name || '',
    phone: authUser.phone || '',
  })
  if (!session.name) session.name = authUser.user_metadata?.name || ''
  if (!session.phone) session.phone = authUser.phone || ''

  const ownerKey = ownerKeyFromSession(session)
  try {
    await hydrateFromSupabase(userId, ownerKey, { employedDriver: !!session.linkedOwnerId })
    return { session, hydrateError: false }
  } catch (error) {
    console.error('[boot] hydrate 실패, 로컬 데이터로 계속합니다.', error)
    return { session, hydrateError: true }
  }
}
