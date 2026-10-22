// @ts-check
// 라우터 최상위. 세션·부트·토스트 상태만 두고 화면별 로직은 AuthRoute/AppShell이 맡는다.
import { useMemo } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import OnboardingPage from '../features/account/ui/OnboardingPage.jsx'
import WelcomeProfileView from '../features/account/ui/WelcomeProfileView.jsx'
import BootRetryScreen from './shell/BootRetryScreen.jsx'
import LoadFailScreen from './shell/LoadFailScreen.jsx'
import PageLoadErrorBoundary from './shell/PageLoadErrorBoundary.jsx'
import { ensureProfileRow } from '../data/cloud/supabaseClient.ts'
import { endCloudSession } from '../data/cloud/cloudSession.ts'
import { hydrateFromSupabase } from '../data/hydrate/hydrate.ts'
import { ownerKeyFromSession } from '../data/cloud/appSession.ts'
import { AccountFlowBodyClass, PendingWriteRetryBridge } from './providers.jsx'
import AuthRoute from './routes/AuthRoute.jsx'
import AppShell from './shell/AppShell.jsx'
import RequireSession from './routes/RequireSession.jsx'
import { applyOnboardingWizard } from '../data/sync/onboardingFinish.ts'
import { GUEST_APP_SESSION, setGuestModePersisted } from './guestSessionPersist.js'
import { useAppSession } from './useAppSession.js'
import ToastMessage from './shell/ToastMessage.jsx'
import { ToastProvider } from '../shared/hooks/useToast.js'
import { SessionProvider } from '../data/cloud/sessionContext.ts'
import '../shared/styles/variables.css'
import '../shared/styles/app-base.css'
import '../shared/styles/account-flow.css'
import '../shared/styles/auth-form.css'
import '../shared/styles/onboarding.css'
import '../shared/styles/switch.css'
import '../shared/styles/modal-base.css'
import '../shared/styles/toast.css'
import '../shared/styles/side-menu.css'
import '../shared/styles/management-common.css'
import '../shared/styles/controls-common.css'
import '../shared/styles/app-shell-base.css'
import '../shared/styles/header-controls.css'
import '../shared/styles/shared-controls.css'
import '../shared/styles/modal-form.css'

/** @typedef {import('../data/sync/syncTypes.ts').AppSession} AppSession */

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    session,
    setSession,
    toast,
    showToast,
    booting,
    bootLinkFailed,
    guestLoadFailed,
    ownerKey,
    cars,
    inAccountFlow,
    goHome,
    handleLogout,
  } = useAppSession()
  const sessionValue = useMemo(() => ({ session, ownerKey }), [session, ownerKey])

  if (bootLinkFailed) return <BootRetryScreen />
  if (guestLoadFailed) return <LoadFailScreen />

  return (
    <ToastProvider value={showToast}>
    <SessionProvider value={sessionValue}>
      <PendingWriteRetryBridge />
      <AccountFlowBodyClass active={inAccountFlow} />

      {/* 로그인·처음 정보 입력 화면도 그리다 오류가 나면 빈 화면 대신 안내(로드맵 55). 로그인 뒤 화면은 AppShell 안쪽 안내가 먼저 잡는다. */}
      <PageLoadErrorBoundary resetKey={location.pathname}>
      <Routes>
        <Route
          path="/auth"
          element={(
            <AuthRoute
              booting={booting}
              onGuest={() => {
                endCloudSession()
                setGuestModePersisted(true)
                goHome(
                  GUEST_APP_SESSION,
                  '비회원 모드로 시작합니다. 언제든 마이페이지에서 로그인할 수 있습니다.',
                )
              }}
            />
          )}
        />

        <Route
          path="/welcome"
          element={(
            <RequireSession booting={booting}>
              <div className="container account-flow-container">
                <WelcomeProfileView
                  initialName={session?.name || ''}
                  onSubmit={async ({ name, phone }) => {
                    if (!session?.userId) return false
                    const { error } = await ensureProfileRow(session.userId, 'owner_driver', name, phone)
                    if (error) {
                      showToast('정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
                      return false
                    }
                    // 가입과 같이 다시 불러와 Store 프로필을 채운다 — 안 하면 첫 설정 저장이 빈 전화번호로 행을 덮어씀.
                    try {
                      await hydrateFromSupabase(session.userId, ownerKeyFromSession(session))
                    } catch (hydrateError) {
                      console.error(hydrateError)
                    }
                    setSession({ ...session, name, phone })
                    navigate('/onboarding', { replace: true })
                    return true
                  }}
                />
              </div>
            </RequireSession>
          )}
        />

        <Route
          path="/onboarding"
          element={(
            <RequireSession booting={booting}>
              <div className="container account-flow-container">
                <OnboardingPage
                  accountType={session?.accountType || 'owner_driver'}
                  onFinish={async (/** @type {import('../data/sync/onboardingFinish.ts').OnboardingWizard} */ wizard) => {
                    const outcome = await applyOnboardingWizard({
                      ownerKey,
                      userId: session?.userId,
                      cars,
                      wizard,
                    })
                    goHome(session, outcome.toast || '설정을 저장했어요.')
                  }}
                />
              </div>
            </RequireSession>
          )}
        />

        <Route
          path="/app/*"
          element={(
            <RequireSession booting={booting}>
              <AppShell
                onBackToAuth={() => handleLogout()}
                onGoAuth={() => handleLogout({ signOut: true })}
                onSessionUpdate={(/** @type {AppSession} */ next) => setSession(next)}
              />
            </RequireSession>
          )}
        />

        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
      </PageLoadErrorBoundary>


      <ToastMessage message={toast} />
    </SessionProvider>
    </ToastProvider>
  )
}
