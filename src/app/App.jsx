// Step 3 라우터 셸: 옛 src/App.jsx의 screen/appPage 문자열 스위치를 실제 라우트로 바꾼
// 자리. 세션·부트·토스트처럼 화면을 넘나드는 상태만 여기 남기고, 화면별 로직은
// AuthRoute/AppShell로 옮겼다 (migration-audit-plan.md Step 3).
import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import OnboardingPage from '../components/OnboardingPage.jsx'
import ForgotPasswordModal from '../components/ForgotPasswordModal.jsx'
import { applyTheme, loadPracticeSettings } from '../lib/practiceSettings.js'
import { endCloudSession, flushCloudSync, hydrateFromSupabase } from '../lib/cloudSync.js'
import { supabase } from '../supabaseClient.js'
import { restoreSessionOnBoot } from './boot.js'
import { AccountFlowBodyClass, SyncFlushBridge } from './providers.jsx'
import { initializeOwnerFromPersist } from '../store/owner-state.js'
import AuthRoute from './AuthRoute.jsx'
import AppShell from './AppShell.jsx'
import RequireSession from './RequireSession.jsx'
import '../account-flow.css'
import '../side-menu.css'

export default function App() {
  const [session, setSession] = useState(null)
  const [toast, setToast] = useState('')
  const [forgotOpen, setForgotOpen] = useState(false)
  const [booting, setBooting] = useState(true)

  const navigate = useNavigate()
  const location = useLocation()

  const ownerKey = session?.userId || (session?.guestMode ? 'guest' : session?.phone) || 'guest'
  const inAccountFlow = location.pathname.startsWith('/auth') || location.pathname === '/onboarding'

  function showToast(message) {
    setToast(message)
  }

  // navigate는 react-router가 참조 안정성을 보장하므로, goHome을 useCallback으로 감싸면
  // 아래 부트 이펙트가 정확한 의존성 배열([goHome])로도 마운트 시 한 번만 돈다.
  const goHome = useCallback((nextSession, message) => {
    setSession(nextSession)
    navigate('/app', { replace: true })
    if (message) setToast(message)
  }, [navigate])

  // Step 2 부트: 새로고침 시 Supabase 세션을 복원한다. 로그인 상태가 아니면 그대로
  // /auth에 남는다 — 게스트/로그아웃 동작은 바뀌지 않는다.
  useEffect(() => {
    let cancelled = false
    restoreSessionOnBoot().then((restored) => {
      if (cancelled) return
      if (restored) {
        goHome(
          restored.session,
          restored.hydrateError ? '로그인은 유지됐지만 클라우드 데이터를 일부 못 불러왔습니다.' : undefined,
        )
      }
      setBooting(false)
    })
    return () => { cancelled = true }
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
              onLogin={async (user) => {
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
              onSignup={async (user) => {
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
