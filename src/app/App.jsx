// @ts-check
// Step 3 라우터 셸: 옛 src/App.jsx의 screen/appPage 문자열 스위치를 실제 라우트로 바꾼
// 자리. 세션·부트·토스트 상태만 여기 남기고, 화면별 로직은 AuthRoute/AppShell로 옮겼다.
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import OnboardingPage from '../components/OnboardingPage.jsx'
import ForgotPasswordModal from '../components/ForgotPasswordModal.jsx'
import { endCloudSession } from '../lib/cloudSession.js'
import { hydrateFromSupabase } from '../lib/hydrate.js'
import { buildCloudAppSession, ownerKeyFromSession } from './boot.js'
import { AccountFlowBodyClass, PendingWriteRetryBridge, SyncFlushBridge } from './providers.jsx'
import AuthRoute from './AuthRoute.jsx'
import AppShell from './AppShell.jsx'
import RequireSession from './RequireSession.jsx'
import { applyOnboardingWizard } from '../lib/onboardingFinish.js'
import {
  clearGuestModePersisted,
  GUEST_APP_SESSION,
  setGuestModePersisted,
} from './guestSessionPersist.js'
import { useAppSession } from './useAppSession.js'
import '../account-flow.css'
import '../side-menu.css'

/** @typedef {import('../lib/outboxTypes.js').AppSession} AppSession */

export default function App() {
  const navigate = useNavigate()
  const {
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
  } = useAppSession()

  return (
    <>
      <SyncFlushBridge />
      <PendingWriteRetryBridge />
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
                setGuestModePersisted(true)
                goHome(
                  GUEST_APP_SESSION,
                  '비회원 모드로 시작합니다. 언제든 마이페이지에서 로그인할 수 있어요.',
                )
              }}
              onLogin={async (/** @type {AppSession} */ user) => {
                clearGuestModePersisted()
                /** @type {AppSession} */
                let next = { ...user, guestMode: false }
                if (user?.userId) {
                  next = await buildCloudAppSession(user.userId, {
                    name: user.name,
                    phone: user.phone,
                  })
                  try {
                    await hydrateFromSupabase(user.userId, ownerKeyFromSession(next), {
                      employedDriver: !!next.linkedOwnerId,
                    })
                  } catch (error) {
                    console.error(error)
                    showToast('로그인은 됐지만 클라우드 데이터를 일부 못 불러왔습니다.')
                  }
                }
                goHome(next)
              }}
              onSignup={async (/** @type {AppSession} */ user) => {
                clearGuestModePersisted()
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
                  onFinish={async (/** @type {import('../lib/onboardingFinish.js').OnboardingWizard} */ wizard) => {
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
            <RequireSession session={session} booting={booting}>
              <AppShell
                ownerKey={ownerKey}
                session={session}
                showToast={showToast}
                onBackToAuth={() => handleLogout()}
                onGoAuth={() => handleLogout({ signOut: true })}
                onSessionUpdate={(/** @type {AppSession} */ next) => setSession(next)}
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
