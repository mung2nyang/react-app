// 앱을 켤 때·화면을 옮길 때 서버에 물어 문의 알림을 만든다. 실패하면 문의 알림만 빠진다.
import { useEffect, useState } from 'react'
import { isCloudSession } from '../../../data/cloud/cloudSession.ts'
import { useSession } from '../../../data/cloud/sessionContext.ts'
import { useIsAdmin } from '../../../data/cloud/adminRole.ts'
import { fetchMyAnsweredInquiries, fetchPendingInquirySummary } from '../../../data/cloud/inquiryNotices.ts'
import { NO_INQUIRY_NOTICES } from '../api/inquiryNoticeItems.ts'
import type { InquiryNoticeData } from '../api/inquiryNoticeItems.ts'

/** @param refreshKey 바뀔 때마다 다시 물어본다(화면 주소). */
export default function useInquiryNotices(refreshKey = ''): InquiryNoticeData {
  const { session } = useSession()
  const userId = isCloudSession(session) ? session?.userId ?? null : null
  const role = useIsAdmin()
  const [loaded, setLoaded] = useState<{ userId: string, data: InquiryNoticeData } | null>(null)

  useEffect(() => {
    if (!userId || role === 'checking') return
    let cancelled = false
    const admin = role === 'admin'
    void Promise.all([
      fetchMyAnsweredInquiries(userId).catch(() => []),
      admin ? fetchPendingInquirySummary().catch(() => null) : Promise.resolve(null),
    ]).then(([answered, pending]) => {
      if (!cancelled) setLoaded({ userId, data: { answered, pending } })
    })
    return () => { cancelled = true }
  }, [userId, role, refreshKey])

  // 계정이 바뀌면 이전 계정 값은 버린다.
  if (!userId || loaded?.userId !== userId) return NO_INQUIRY_NOTICES
  return loaded.data
}
