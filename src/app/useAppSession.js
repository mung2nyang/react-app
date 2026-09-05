// @ts-check
// App.jsx에서 분리한 세션/부트/토스트 state·이펙트·handleLogout(순수 구조 분리).
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { applyTheme } from '../lib/practiceSettings.js'
import { endCloudSession } from '../lib/cloudSession.js'
import { flushCloudSync } from '../lib/syncQueue.js'
import { confirmLeaveIfUnsafe } from '../lib/durableWriteGuard.js'
import { supabase } from '../supabaseClient.js'
import { restoreSessionOnBoot, ownerKeyFromSession } from './boot.js'
import { initializeOwnerFromPersist } from '../store/owner-state.js'
import { useOwnerCars, useOwnerSettings } from '../store/ownerDataHooks.js'
import { isAlreadyInAppOnBoot } from './bootHomeGuard.js'
import {
  clearGuestModePersisted,
  GUEST_APP_SESSION,
  isGuestModePersisted,
} from './guestSessionPersist.js'

/** @typedef {import('../lib/outboxTypes.js').AppSession} AppSession */

export function useAppSession() {
  const [session, setSession] = useState(/** @type {AppSession|null} */ (null))
  const [toast, setToast] = useState('')
  const [forgotOpen, setForgotOpen] = useState(false)
  const [booting, setBooting] = useState(true)

  const navigate = useNavigate()
  const location = useLocation()

  const ownerKey = ownerKeyFromSession(session)
  const practiceSettings = useOwnerSettings(ownerKey)
  const cars = useOwnerCars(ownerKey)
  const inAccountFlow = location.pathname.startsWith('/auth') || location.pathname === '/onboarding'

  /** @param {string} message */
  function showToast(message) {
    setToast(message)
  }

  // useNavigate()는 라우트가 바뀔 때마다 새 함수를 반환해서, goHome을
  // useCallback(fn, [navigate])로 감싸면 매 전환마다 재생성돼 부트 이펙트가 다시
  // 돌고 로그인 계정이 어디로 이동해도 goHome()이 /app으로 되돌려 보냈다(실측
  // 확인) — navigate를 ref로 감싸 진짜 빈 의존성 배열로 고정한다.
  const navigateRef = useRef(navigate)
  useEffect(() => { navigateRef.current = navigate }) // 의존성 배열 없음 — 매 렌더 후 최신 navigate로 갱신.

  const goHome = useCallback(
    /** @type {(nextSession: AppSession|null, message?: string) => void} */
    ((nextSession, message) => {
      setSession(nextSession)
      navigateRef.current('/app', { replace: true })
      if (message) setToast(message)
    }),
    [],
  )

  // Step 2 부트: 새로고침 시 Supabase 세션을 복원한다. 로그인 상태가 아니면 그대로
  // /auth에 남는다 — 게스트/로그아웃 동작은 바뀌지 않는다. 이미 /app(또는
  // /onboarding)에 진입해 있었으면(=새로고침/딥링크) goHome()을 건너뛴다 — 그
  // 판단·이유는 bootHomeGuard.js(재감사 6번, 완료 조건 "새로고침 후 같은 달").
  const homePathRef = useRef(location.pathname)
  useEffect(() => { homePathRef.current = location.pathname })

  useEffect(() => {
    let cancelled = false
    restoreSessionOnBoot().then((restored) => {
      if (cancelled) return
      if (restored) {
        clearGuestModePersisted()
        const message = restored.hydrateError ? '로그인은 유지됐지만 클라우드 데이터를 일부 못 불러왔습니다.' : undefined
        if (isAlreadyInAppOnBoot(homePathRef.current)) {
          setSession(restored.session)
          if (message) setToast(message)
        } else {
          goHome(restored.session, message)
        }
      } else if (isGuestModePersisted()) {
        const guestSession = GUEST_APP_SESSION
        if (isAlreadyInAppOnBoot(homePathRef.current)) {
          setSession(guestSession)
        } else {
          goHome(guestSession)
        }
      }
      setBooting(false)
    })
    return () => { cancelled = true }
    // goHome은 이제 useCallback(fn, [])로 항상 같은 참조라 여기 넣어도 재실행을
    // 유발하지 않는다 — 린트 경고 없이 "마운트 시 한 번만" 계약을 유지한다.
  }, [goHome])

  // Step 0-4 감사 보완: ownerKey가 정해질 때마다(게스트든 로그인이든) store를 persist된
  // 값으로 채운다. hydrate는 그 위에 서버 값을 덮어쓸 뿐 — 이 초기화 없이는 hydrate가
  // 없는 게스트 세션에서 store가 계속 비어 있게 된다.
  useEffect(() => {
    initializeOwnerFromPersist(ownerKey)
  }, [ownerKey])

  useEffect(() => {
    applyTheme(practiceSettings.theme)
  }, [practiceSettings.theme, location.pathname])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  async function handleLogout({ signOut = false } = {}) {
    // 로그아웃도 전역 이동 경로다 — DayLogPage를 안 거치므로 여기서 직접 가드한다.
    if (!confirmLeaveIfUnsafe()) return
    try { await flushCloudSync() } catch { /* ignore */ }
    if (signOut) {
      try { await supabase.auth.signOut() } catch { /* ignore */ }
    }
    endCloudSession()
    clearGuestModePersisted()
    setSession(null)
    navigate('/auth', { replace: true })
  }

  return {
    session,
    setSession,
    toast,
    showToast,
    forgotOpen,
    setForgotOpen,
    booting,
    ownerKey,
    cars,
    inAccountFlow,
    goHome,
    handleLogout,
  }
}
