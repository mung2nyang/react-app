// 이 계정이 관리자 명단(admin_users)에 있는지 — 메뉴·화면 문 표시용. 진짜 막는 건 서버 함수(0025).
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.ts'
import { isCloudSession } from './cloudSession.ts'
import { useSession } from './sessionContext.ts'

export type AdminRole = 'checking' | 'admin' | 'no'

/** 서버 오류·이상한 응답은 "아님"(메뉴 숨김 쪽). */
export async function fetchIsAdmin(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_admin')
    return !error && data === true
  } catch {
    return false
  }
}

export function useIsAdmin(): AdminRole {
  const { session } = useSession()
  const userId = isCloudSession(session) ? session?.userId ?? null : null
  const [checked, setChecked] = useState<{ userId: string, admin: boolean } | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void fetchIsAdmin().then((admin) => {
      if (!cancelled) setChecked({ userId, admin })
    })
    return () => { cancelled = true }
  }, [userId])

  if (!userId) return 'no'
  if (checked?.userId !== userId) return 'checking'
  return checked.admin ? 'admin' : 'no'
}
