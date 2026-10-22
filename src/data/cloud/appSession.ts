// 로그인 세션 만들기 — 프로필·연동 기사 여부로 AppSession과 ownerKey를 정한다(앱 시작·초대 코드 입력·연동 해제가 같이 씀).
import type { JsonValue } from '../../domain/jsonTypes.ts'
import { supabase } from './supabaseClient.ts'
import { checkLinkedDriverLink, fetchLinkedDriverLink } from '../sync/driverLinkRpc.ts'
import { settleExpiredDriverUnlinks } from '../sync/driverUnlink.ts'
import type { AppSession } from '../sync/syncTypes.ts'

async function fetchAccountProfile(userId: string): Promise<{ name: string, phone: string, accountType: string }> {
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

/** 구글 첫 로그인처럼 내 profiles 행이 아직 없는지. 조회가 실패하면 false(지금처럼 홈으로). */
export async function isProfileRowMissing(userId: string) {
  try {
    const { data, error } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle()
    return !error && !data
  } catch (error) {
    console.warn('[boot] profiles 행 확인 실패, 홈으로 진행합니다.', error)
    return false
  }
}

/** 프로필 + driver_links linked 행으로 AppSession을 만든다. */
export async function buildCloudAppSession(userId: string, overrides: { name?: string, phone?: string } = {}): Promise<AppSession> {
  const profile = await fetchAccountProfile(userId)
  // 3일 지난 해제 요청을 먼저 처리해야 기사가 열 때도 해제된 상태로 시작한다.
  await settleExpiredDriverUnlinks()
  return sessionFromLink(userId, overrides, profile, await fetchLinkedDriverLink(userId))
}

export const LINK_RETRY_MS = 1000

/** 앱 켤 때만 — 연동 확인이 실패하면 1초 뒤 1번 더, 그래도 실패하면 null(본인 칸으로 들어가지 않게). */
export async function buildBootSession(userId: string, overrides: { name?: string, phone?: string }, retryMs: number): Promise<AppSession | null> {
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

function sessionFromLink(userId: string, overrides: { name?: string, phone?: string }, profile: { name: string, phone: string, accountType: string }, link: { owner_id?: JsonValue } | null): AppSession {
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

export function ownerKeyFromSession(session: AppSession | null | undefined): string {
  if (session?.linkedOwnerId) return session.linkedOwnerId
  if (session?.userId) return session.userId
  if (session?.guestMode) return 'guest'
  return session?.phone || 'guest'
}
