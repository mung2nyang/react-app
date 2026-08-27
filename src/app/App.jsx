// @ts-check
// Step 3 라우터 셸: 옛 src/App.jsx의 screen/appPage 문자열 스위치를 실제 라우트로 바꾼
// 자리. 세션·부트·토스트처럼 화면을 넘나드는 상태만 여기 남기고, 화면별 로직은
// AuthRoute/AppShell로 옮겼다 (migration-audit-plan.md Step 3).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import OnboardingPage from '../components/OnboardingPage.jsx'
import ForgotPasswordModal from '../components/ForgotPasswordModal.jsx'
import { applyTheme, loadPracticeSettings } from '../lib/practiceSettings.js'
import { endCloudSession } from '../lib/cloudSession.js'
import { flushCloudSync } from '../lib/syncQueue.js'
import { hydrateFromSupabase } from '../lib/hydrate.js'
import { supabase } from '../supabaseClient.js'
import { restoreSessionOnBoot } from './boot.js'
import { AccountFlowBodyClass, SyncFlushBridge } from './providers.jsx'
import { initializeOwnerFromPersist } from '../store/owner-state.js'
import { isAlreadyInAppOnBoot } from './bootHomeGuard.js'
import AuthRoute from './AuthRoute.jsx'
import AppShell from './AppShell.jsx'
import RequireSession from './RequireSession.jsx'
import '../account-flow.css'
import '../side-menu.css'

/** @typedef {import('../lib/outboxTypes.js').AppSession} AppSession */

export default function App() {
  const [session, setSession] = useState(/** @type {AppSession|null} */ (null))
  const [toast, setToast] = useState('')
  const [forgotOpen, setForgotOpen] = useState(false)
  const [booting, setBooting] = useState(true)

  const navigate = useNavigate()
  const location = useLocation()

  const ownerKey = session?.userId || (session?.guestMode ? 'guest' : session?.phone) || 'guest'
  const inAccountFlow = location.pathname.startsWith('/auth') || location.pathname === '/onboarding'

  /** @param {string} message */
  function showToast(message) {
    setToast(message)
  }

  // 4차 재작업(사용자 지시 5번): `<BrowserRouter>`의 `useNavigate()`는
  // `location.pathname`이 바뀔 때마다 새 함수를 반환한다 — `goHome`을
  // `useCallback(fn, [navigate])`로 감쌌더니 매 라우트 전환마다 재생성되고 부트
  // 이펙트가 다시 돌아, 로그인 계정이 어떤 탭으로 이동해도 재실행된 goHome()이
  // `/app`으로 되돌려 보냈다(게스트는 restoreSessionOnBoot()이 null이라 안 드러났다).
  // navigate를 ref로 감싸 goHome/부트 이펙트를 진짜 빈 의존성 배열로 고정한다.
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
        const message = restored.hydrateError ? '로그인은 유지됐지만 클라우드 데이터를 일부 못 불러왔습니다.' : undefined
        if (isAlreadyInAppOnBoot(homePathRef.current)) {
          setSession(restored.session)
          if (message) setToast(message)
        } else {
          goHome(restored.session, message)
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
    applyTheme(loadPracticeSettings(ownerKey).theme)
  }, [ownerKey, location.pathname])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  async function handleLogout({ signOut = false } = {}) {
    try { await flushCloudSync() } catch { /* ignore */ }
    if (signOut) {
      try { await supabase.auth.signOut() } catch { /* ignore */ }
    }
    endCloudSession()
    setSession(null)
    navigate('/auth', { replace: true })
  }

  return (
    <>
      <SyncFlushBridge />
      <AccountFlowBodyClass active={inAccountFlow} />

      <Routes>
        <Route
          path="/auth"
          element={(
            <AuthRoute
              booting={booting}
              showToast={showToast}
              onForgotPassword={() => setForgotOpen(true)}
              onGuest={() => {
                endCloudSession()
                goHome(
                  { name: '비회원', accountType: 'owner_driver', guestMode: true },
                  '비회원 모드로 시작합니다. 언제든 마이페이지에서 로그인할 수 있어요.',
                )
              }}
              onLogin={async (/** @type {AppSession} */ user) => {
                if (user?.userId) {
                  try {
                    await hydrateFromSupabase(user.userId, user.userId)
                  } catch (error) {
                    console.error(error)
                    showToast('로그인은 됐지만 클라우드 데이터를 일부 못 불러왔습니다.')
                  }
                }
                goHome({ ...user, guestMode: false })
              }}
              onSignup={async (/** @type {AppSession} */ user) => {
                if (user?.userId) {
                  try {
                    await hydrateFromSupabase(user.userId, user.userId)
                  } catch (error) {
                    console.error(error)
                  }
                }
                setSession({ ...user, guestMode: false })
                navigate('/onboarding')
              }}
            />
          )}
        />

        <Route
          path="/onboarding"
          element={(
            <RequireSession session={session} booting={booting}>
              <div className="container account-flow-container">
                <OnboardingPage
                  accountType={session?.accountType || 'owner_driver'}
                  onFinish={() => goHome(session, '설정을 저장했어요.')}
                />
              </div>
            </RequireSession>
          )}
        />

        <Route
          path="/app/*"
          element={(
            <RequireSession session={session} booting={booting}>
              <AppShell
                ownerKey={ownerKey}
                session={session}
                showToast={showToast}
                onBackToAuth={() => handleLogout()}
                onGoAuth={() => handleLogout({ signOut: true })}
              />
            </RequireSession>
          )}
        />

        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>

      {forgotOpen && <ForgotPasswordModal onClose={() => setForgotOpen(false)} />}

      {toast && <div className="toast-message" role="status">{toast}</div>}
    </>
  )
}
