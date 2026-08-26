import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import AuthPage from './components/AuthPage.jsx'
import ForgotPasswordModal from './components/ForgotPasswordModal.jsx'
import OnboardingPage from './components/OnboardingPage.jsx'
import MainPage from './components/MainPage.jsx'
import SideMenu from './components/SideMenu.jsx'
import NotificationPanel from './components/NotificationPanel.jsx'
import BottomNav from './components/BottomNav.jsx'
import { todayWorkLogSelection } from './lib/calendar.js'
import { collectNotifications, dismissNotification } from './lib/notifications.js'
import { applyTheme, loadPracticeSettings } from './lib/practiceSettings.js'
import { endCloudSession, flushCloudSync, hydrateFromSupabase } from './lib/cloudSync.js'
import { supabase } from './supabaseClient.js'
import { restoreSessionOnBoot } from './app/boot.js'
import { SyncFlushBridge } from './app/providers.jsx'
import './account-flow.css'
import './side-menu.css'

const CarManagementPage = lazy(() => import('./components/CarManagementPage.jsx'))
const ClientManagementPage = lazy(() => import('./components/ClientManagementPage.jsx'))
const PersonalInfoPage = lazy(() => import('./components/PersonalInfoPage.jsx'))
const AppSettingsPage = lazy(() => import('./components/AppSettingsPage.jsx'))
const MaintFuelPage = lazy(() => import('./components/MaintFuelPage.jsx'))
const ReceivablesPage = lazy(() => import('./components/ReceivablesPage.jsx'))
const ReportPage = lazy(() => import('./components/ReportPage.jsx'))
const TaxInvoicePage = lazy(() => import('./components/TaxInvoicePage.jsx'))
const DriverConnectionPage = lazy(() => import('./components/DriverConnectionPage.jsx'))
const ComingSoonPage = lazy(() => import('./components/ComingSoonPage.jsx'))
const RevenuePage = lazy(() => import('./components/RevenuePage.jsx'))
const MyPage = lazy(() => import('./components/MyPage.jsx'))

export default function App() {
  const [screen, setScreen] = useState('auth')
  const [appPage, setAppPage] = useState('home')
  const [soonTitle, setSoonTitle] = useState('')
  const [soonBack, setSoonBack] = useState('home')
  const [workLogSelected, setWorkLogSelected] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifTick, setNotifTick] = useState(0)
  const [session, setSession] = useState(null)
  const [toast, setToast] = useState('')
  const [forgotOpen, setForgotOpen] = useState(false)
  const [booting, setBooting] = useState(true)

  const ownerKey = session?.userId || (session?.guestMode ? 'guest' : session?.phone) || 'guest'
  const inAccountFlow = screen === 'auth' || screen === 'onboarding'
  const notifications = useMemo(() => collectNotifications(ownerKey), [ownerKey, notifTick])

  // Step 2 부트: 새로고침 시 Supabase 세션을 복원한다. 로그인 상태가 아니면 그대로
  // screen='auth'에 남는다 — 게스트/로그아웃 동작은 바뀌지 않는다 (migration-audit-plan.md Step 2).
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
  }, [])

  useEffect(() => {
    document.body.classList.toggle('account-flow-active', inAccountFlow)
    return () => document.body.classList.remove('account-flow-active')
  }, [inAccountFlow])

  useEffect(() => {
    applyTheme(loadPracticeSettings(ownerKey).theme)
  }, [ownerKey, screen])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  function showToast(message) {
    setToast(message)
  }

  function goHome(nextSession, message) {
    setSession(nextSession)
    setScreen('home')
    setAppPage('home')
    setWorkLogSelected(null)
    setMenuOpen(false)
    setNotifOpen(false)
    if (message) showToast(message)
  }

  function selectMenu(page, title) {
    setWorkLogSelected(null)
    if (page === 'soon') {
      setSoonTitle(title || '')
      setSoonBack('home')
      setAppPage('soon')
      return
    }
    setAppPage(page)
  }

  function openPage(page, title) {
    setWorkLogSelected(null)
    if (page === 'soon') {
      setSoonTitle(title || '')
      setSoonBack('mypage')
      setAppPage('soon')
      return
    }
    setAppPage(page)
  }

  function selectTab(tab) {
    setMenuOpen(false)
    setNotifOpen(false)
    if (tab === 'home') {
      setWorkLogSelected(null)
      setAppPage('home')
      return
    }
    if (tab === 'work') {
      setWorkLogSelected(todayWorkLogSelection())
      setAppPage('home')
      return
    }
    if (tab === 'revenue') {
      setWorkLogSelected(null)
      setAppPage('revenue')
      return
    }
    setWorkLogSelected(null)
    setAppPage('mypage')
  }

  const activeNav = appPage === 'home'
    ? (workLogSelected ? 'work' : 'home')
    : (appPage === 'revenue' ? 'revenue' : 'mypage')


  return (
    <>
      <SyncFlushBridge />

      {booting && screen === 'auth' && (
        <div className="container account-flow-container">
          <div className="page">불러오는 중...</div>
        </div>
      )}

      {!booting && screen === 'auth' && (
        <div className="container account-flow-container">
          <AuthPage
            showToast={showToast}
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
              setScreen('onboarding')
            }}
            onForgotPassword={() => setForgotOpen(true)}
          />
        </div>
      )}

      {screen === 'onboarding' && (
        <div className="container account-flow-container">
          <OnboardingPage
            accountType={session?.accountType || 'owner_driver'}
            onFinish={() => goHome(session, '설정을 저장했어요.')}
          />
        </div>
      )}

      {screen === 'home' && (
        <div className="container main-app-container">
          <Suspense fallback={<div className="page">불러오는 중...</div>}>
            {appPage === 'home' && (
              <MainPage
                userName={session?.name}
                ownerKey={ownerKey}
                selected={workLogSelected}
                onSelectDay={setWorkLogSelected}
                onCloseWorkLog={() => setWorkLogSelected(null)}
                onOpenMenu={() => setMenuOpen(true)}
                onOpenNotifs={() => {
                  setNotifTick((n) => n + 1)
                  setNotifOpen(true)
                }}
                notifCount={notifications.length}
                showToast={showToast}
                onWorkChanged={() => setNotifTick((n) => n + 1)}
                onBackToAuth={async () => {
                  try { await flushCloudSync() } catch { /* ignore */ }
                  endCloudSession()
                  setSession(null)
                  setScreen('auth')
                  setAppPage('home')
                  setWorkLogSelected(null)
                }}
              />
            )}
            {appPage === 'cars' && (
              <CarManagementPage
                ownerKey={ownerKey}
                showToast={showToast}
                onBack={() => setAppPage('home')}
              />
            )}
            {appPage === 'clients' && (
              <ClientManagementPage
                ownerKey={ownerKey}
                showToast={showToast}
                onBack={() => setAppPage('home')}
              />
            )}
            {appPage === 'profile' && (
              <PersonalInfoPage
                ownerKey={ownerKey}
                session={session}
                showToast={showToast}
                onBack={() => setAppPage('home')}
                onGoAuth={async () => {
                  try { await flushCloudSync() } catch { /* ignore */ }
                  try { await supabase.auth.signOut() } catch { /* ignore */ }
                  endCloudSession()
                  setSession(null)
                  setScreen('auth')
                  setAppPage('home')
                }}
              />
            )}
            {appPage === 'settings' && (
              <AppSettingsPage
                ownerKey={ownerKey}
                showToast={showToast}
                onBack={() => setAppPage('home')}
              />
            )}
            {appPage === 'expenses' && (
              <MaintFuelPage
                ownerKey={ownerKey}
                showToast={showToast}
                onBack={() => setAppPage('home')}
              />
            )}
            {appPage === 'receivables' && (
              <ReceivablesPage
                ownerKey={ownerKey}
                showToast={showToast}
                onWorkChanged={() => setNotifTick((n) => n + 1)}
                onBack={() => { setAppPage('home'); setNotifTick((n) => n + 1) }}
              />
            )}
            {appPage === 'report' && (
              <ReportPage
                ownerKey={ownerKey}
                onBack={() => setAppPage('home')}
              />
            )}
            {appPage === 'invoices' && (
              <TaxInvoicePage
                ownerKey={ownerKey}
                showToast={showToast}
                onBack={() => setAppPage('home')}
              />
            )}
            {appPage === 'drivers' && (
              <DriverConnectionPage
                ownerKey={ownerKey}
                session={session}
                showToast={showToast}
                onBack={() => { setAppPage('home'); setNotifTick((n) => n + 1) }}
              />
            )}
            {appPage === 'soon' && (
              <ComingSoonPage title={soonTitle} onBack={() => setAppPage(soonBack)} />
            )}
            {appPage === 'revenue' && (
              <RevenuePage
                ownerKey={ownerKey}
                session={session}
                onBack={() => setAppPage('home')}
              />
            )}
            {appPage === 'mypage' && (
              <MyPage
                session={session}
                ownerKey={ownerKey}
                onOpen={openPage}
                onBack={() => setAppPage('home')}
              />
            )}
          </Suspense>
          <BottomNav active={activeNav} onSelect={selectTab} />
          <SideMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            onSelect={selectMenu}
          />
          <NotificationPanel
            open={notifOpen}
            items={notifications}
            onClose={() => setNotifOpen(false)}
            onOpenItem={(item) => {
              setNotifOpen(false)
              setWorkLogSelected(null)
              setAppPage(item.page || 'home')
            }}
            onDismiss={(id) => {
              dismissNotification(ownerKey, id)
              setNotifTick((n) => n + 1)
            }}
          />
        </div>
      )}

      {forgotOpen && <ForgotPasswordModal onClose={() => setForgotOpen(false)} />}

      {toast && <div className="toast-message" role="status">{toast}</div>}
    </>
  )
}
