// @ts-check
// Step 2 부트 시퀀스: 새로고침 시 Supabase 세션을 복원한다.
// 슬라이스 E(소속기사): linked driver_links가 있으면 accountType=employed_driver,
// linkedOwnerId로 hydrate ownerKey를 잡는다.
import { supabase } from '../supabaseClient.js'
import { hydrateFromSupabase } from '../lib/hydrate.js'
import { singleFlight } from '../lib/singleFlight.js'
import { checkLinkedDriverLink, fetchLinkedDriverLink } from '../lib/driverLinkRpc.js'
import { settleExpiredDriverUnlinks } from '../lib/driverUnlink.js'

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
 * 구글 첫 로그인처럼 내 profiles 행이 아직 없는지. 조회가 실패하면 false(지금처럼 홈으로).
 * @param {string} userId
 */
export async function isProfileRowMissing(userId) {
  try {
    const { data, error } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle()
    return !error && !data
  } catch (error) {
    console.warn('[boot] profiles 행 확인 실패, 홈으로 진행합니다.', error)
    return false
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
  // 로드맵 7-C-2: 3일 지난 해제 요청을 먼저 처리해야 기사가 열 때도 해제된 상태로 시작한다.
  await settleExpiredDriverUnlinks()
  return sessionFromLink(userId, overrides, profile, await fetchLinkedDriverLink(userId))
}

export const LINK_RETRY_MS = 1000

/**
 * 로드맵 19: 앱 켤 때만 — 연동 확인이 실패하면 1초 뒤 1번 더, 그래도 실패하면 null(본인 칸으로 들어가지 않게).
 * @param {string} userId
 * @param {{ name?: string, phone?: string }} overrides
 * @param {number} retryMs
 * @returns {Promise<AppSession|null>}
 */
async function buildBootSession(userId, overrides, retryMs) {
  const profile = await fetchAccountProfile(userId)
  await settleExpiredDriverUnlinks()
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => { setTimeout(resolve, retryMs) })
    try {
      const check = await checkLinkedDriverLink(userId)
      if (check.ok) return sessionFromLink(userId, overrides, profile, check.link)
    } catch (error) {
      console.warn('[boot] 연동 확인 실패', error)
    }
  }
  return null
}

/**
 * @param {string} userId
 * @param {{ name?: string, phone?: string }} overrides
 * @param {{ name: string, phone: string, accountType: string }} profile
 * @param {{ owner_id?: unknown } | null} link
 * @returns {AppSession}
 */
function sessionFromLink(userId, overrides, profile, link) {
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
 * needsProfile: 내 profiles 행이 없어 홈 대신 기본 정보 화면(/welcome)으로 보내야 함.
 * linkCheckFailed: 연동 확인이 두 번 다 실패 — 어느 칸으로 들어갈지 몰라 안내 화면(로드맵 19).
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
