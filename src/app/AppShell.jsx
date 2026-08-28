// @ts-check
// Step 3 라우터 셸: `/app/*` 레이아웃 라우트. App.jsx의 옛 `screen==='home'` 블록을
// 그대로 옮긴 자리 — 하단탭/사이드메뉴/알림패널은 여기서 한 번만 마운트하고,
// 화면별 콘텐츠는 중첩 <Routes>의 Outlet 자리에서 페이지 컴포넌트가 그린다.
import { Suspense, useMemo, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav.jsx'
import SideMenu from '../components/SideMenu.jsx'
import NotificationPanel from '../components/NotificationPanel.jsx'
import { collectNotifications, dismissNotification } from '../lib/notifications.js'
import { todayWorkLogSelection } from '../lib/calendar.js'
import { confirmLeaveIfUnsafe } from '../lib/durableWriteGuard.js'
import MainPageRoute from './MainPageRoute.jsx'
import ComingSoonRoute from './ComingSoonRoute.jsx'
import HydrationRetryBanner from './HydrationRetryBanner.jsx'
import {
  AppSettingsPage,
  CarManagementPage,
  ClientManagementPage,
  DriverConnectionPage,
  MaintFuelPage,
  MyPage,
  PersonalInfoPage,
  ReceivablesPage,
  ReportPage,
  RevenuePage,
  TaxInvoicePage,
} from './lazyPages.js'

/** @typedef {import('../lib/outboxTypes.js').AppSession} AppSession */
/** @typedef {{ id: string, page?: string, title?: string }} NotificationItem */

// 옛 appPage 식별자 → 실제 라우트 경로. SideMenu/MyPage/알림패널이 공유한다.
/** @type {Record<string, string>} */
const PAGE_PATH = {
  home: '',
  cars: 'cars',
  clients: 'clients',
  expenses: 'expenses',
  receivables: 'receivables',
  report: 'report',
  invoices: 'tax',
  drivers: 'drivers',
  revenue: 'revenue',
  profile: 'me/profile',
  settings: 'me/settings',
  mypage: 'me',
}

/** @param {string} page */
function pagePath(page) {
  const segment = PAGE_PATH[page] ?? page
  return segment ? `/app/${segment}` : '/app'
}

/**
 * @param {Object} props
 * @param {string} props.ownerKey
 * @param {AppSession|null} props.session
 * @param {(message: string) => void} [props.showToast]
 * @param {() => void} [props.onBackToAuth]
 * @param {() => void} [props.onGoAuth]
 */
export default function AppShell({ ownerKey, session, showToast, onBackToAuth, onGoAuth }) {
  const location = useLocation()
  const rawNavigate = useNavigate()
  // 재감사 4차(FAIL 지적 3번) — DayLogPage 헤더의 "뒤로가기"만 durableWriteGuard로
  // 막고 있었다. BottomNav/SideMenu/알림 패널/각 페이지 onBack이 부르는 navigate는
  // 전부 이 지역 변수 하나를 거치므로, 여기서 한 번만 감싸면 아래 11곳 전부가
  // 자동으로 같은 가드를 받는다. (to, options)/(delta: number) 두 오버로드를
  // any/unknown 없이 그대로 좁히려고 number 여부로 직접 분기한다.
  /**
   * @param {import('react-router-dom').To | number} to
   * @param {import('react-router-dom').NavigateOptions} [options]
   */
  function navigate(to, options) {
    if (!confirmLeaveIfUnsafe()) return
    if (typeof to === 'number') { rawNavigate(to); return }
    rawNavigate(to, options)
  }
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifTick, setNotifTick] = useState(0)

  const notifications = useMemo(() => collectNotifications(ownerKey), [ownerKey, notifTick])
  const bumpNotifTick = () => setNotifTick((n) => n + 1)

  const activeNav = location.pathname === '/app'
    ? 'home'
    : location.pathname.startsWith('/app/day/')
      ? 'work'
      : location.pathname === '/app/revenue'
        ? 'revenue'
        : 'mypage'

  /** @param {string} page @param {string} [title] @param {string} [backFallback] */
  function goToPage(page, title, backFallback) {
    if (page === 'soon') {
      const query = new URLSearchParams({ title: title || '', back: backFallback || '' })
      navigate(`/app/soon?${query.toString()}`)
      return
    }
    navigate(pagePath(page))
  }

  /** @param {string} tab */
  function selectTab(tab) {
    setMenuOpen(false)
    setNotifOpen(false)
    if (tab === 'work') {
      navigate(`/app/day/${todayWorkLogSelection().dateKey}`)
      return
    }
    if (tab === 'revenue') {
      navigate('/app/revenue')
      return
    }
    navigate(tab === 'home' ? '/app' : '/app/me')
  }

  return (
    <div className="container main-app-container">
      <HydrationRetryBanner showToast={showToast} />
      <Suspense fallback={<div className="page">불러오는 중...</div>}>
        <Routes>
          <Route
            index
            element={(
              <MainPageRoute
                ownerKey={ownerKey}
                userName={session?.name}
                showToast={showToast}
                onWorkChanged={bumpNotifTick}
                notifCount={notifications.length}
                onOpenMenu={() => setMenuOpen(true)}
                onOpenNotifs={() => { bumpNotifTick(); setNotifOpen(true) }}
                onBackToAuth={onBackToAuth}
              />
            )}
          />
          <Route
            path="day/:date"
            element={(
              <MainPageRoute
                ownerKey={ownerKey}
                userName={session?.name}
                showToast={showToast}
                onWorkChanged={bumpNotifTick}
                notifCount={notifications.length}
                onOpenMenu={() => setMenuOpen(true)}
                onOpenNotifs={() => { bumpNotifTick(); setNotifOpen(true) }}
                onBackToAuth={onBackToAuth}
              />
            )}
          />
          <Route path="cars" element={<CarManagementPage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate('/app')} />} />
          <Route path="clients" element={<ClientManagementPage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate('/app')} />} />
          {/* MyPage.jsx는 아직 @ts-check가 없어 session 매개변수 타입을 자기 안의
              session?.accountType 용법만으로(TS가 name 등 다른 필드는 못 봤다)
              좁게 추론한다 — 그 추론 타입이 null을 안 받으므로 undefined로만 바꿔
              건넨다(AppSession 자체는 그대로, MyPage.jsx는 손 안 댔다). */}
          <Route path="me" element={<MyPage session={session ?? undefined} ownerKey={ownerKey} onOpen={(/** @type {string} */ page, /** @type {string} */ title) => goToPage(page, title, 'mypage')} onBack={() => navigate('/app')} />} />
          <Route path="me/profile" element={<PersonalInfoPage ownerKey={ownerKey} session={session} showToast={showToast} onBack={() => navigate('/app')} onGoAuth={onGoAuth} />} />
          <Route path="me/settings" element={<AppSettingsPage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate('/app')} />} />
          <Route path="expenses" element={<MaintFuelPage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate('/app')} />} />
          <Route path="receivables" element={<ReceivablesPage ownerKey={ownerKey} showToast={showToast} onWorkChanged={bumpNotifTick} onBack={() => { navigate('/app'); bumpNotifTick() }} />} />
          <Route path="report" element={<ReportPage ownerKey={ownerKey} onBack={() => navigate('/app')} />} />
          <Route path="tax" element={<TaxInvoicePage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate('/app')} />} />
          <Route path="drivers" element={<DriverConnectionPage ownerKey={ownerKey} session={session} showToast={showToast} onBack={() => { navigate('/app'); bumpNotifTick() }} />} />
          {/* RevenuePage.jsx의 session prop도 undefined만 받는다(위 MyPage와 같은 이유). */}
          <Route path="revenue" element={<RevenuePage ownerKey={ownerKey} session={session ?? undefined} onBack={() => navigate('/app')} />} />
          <Route path="soon" element={<ComingSoonRoute />} />
        </Routes>
      </Suspense>
      <BottomNav active={activeNav} onSelect={selectTab} />
      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSelect={(/** @type {string} */ page, /** @type {string} */ title) => goToPage(page, title, 'home')}
      />
      <NotificationPanel
        open={notifOpen}
        items={notifications}
        onClose={() => setNotifOpen(false)}
        onOpenItem={(/** @type {NotificationItem} */ item) => {
          setNotifOpen(false)
          navigate(pagePath(item.page || 'home'))
        }}
        onDismiss={(/** @type {string} */ id) => {
          dismissNotification(ownerKey, id)
          bumpNotifTick()
        }}
      />
    </div>
  )
}
