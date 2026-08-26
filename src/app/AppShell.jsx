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

// 옛 appPage 식별자 → 실제 라우트 경로. SideMenu/MyPage/알림패널이 공유한다.
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

function pagePath(page) {
  const segment = PAGE_PATH[page] ?? page
  return segment ? `/app/${segment}` : '/app'
}

export default function AppShell({ ownerKey, session, showToast, onBackToAuth, onGoAuth }) {
  const location = useLocation()
  const navigate = useNavigate()
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

  function goToPage(page, title, backFallback) {
    if (page === 'soon') {
      const query = new URLSearchParams({ title: title || '', back: backFallback })
      navigate(`/app/soon?${query.toString()}`)
      return
    }
    navigate(pagePath(page))
  }

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
          <Route path="me" element={<MyPage session={session} ownerKey={ownerKey} onOpen={(page, title) => goToPage(page, title, 'mypage')} onBack={() => navigate('/app')} />} />
          <Route path="me/profile" element={<PersonalInfoPage ownerKey={ownerKey} session={session} showToast={showToast} onBack={() => navigate('/app')} onGoAuth={onGoAuth} />} />
          <Route path="me/settings" element={<AppSettingsPage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate('/app')} />} />
          <Route path="expenses" element={<MaintFuelPage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate('/app')} />} />
          <Route path="receivables" element={<ReceivablesPage ownerKey={ownerKey} showToast={showToast} onWorkChanged={bumpNotifTick} onBack={() => { navigate('/app'); bumpNotifTick() }} />} />
          <Route path="report" element={<ReportPage ownerKey={ownerKey} onBack={() => navigate('/app')} />} />
          <Route path="tax" element={<TaxInvoicePage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate('/app')} />} />
          <Route path="drivers" element={<DriverConnectionPage ownerKey={ownerKey} session={session} showToast={showToast} onBack={() => { navigate('/app'); bumpNotifTick() }} />} />
          <Route path="revenue" element={<RevenuePage ownerKey={ownerKey} session={session} onBack={() => navigate('/app')} />} />
          <Route path="soon" element={<ComingSoonRoute />} />
        </Routes>
      </Suspense>
      <BottomNav active={activeNav} onSelect={selectTab} />
      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSelect={(page, title) => goToPage(page, title, 'home')}
      />
      <NotificationPanel
        open={notifOpen}
        items={notifications}
        onClose={() => setNotifOpen(false)}
        onOpenItem={(item) => {
          setNotifOpen(false)
          navigate(pagePath(item.page || 'home'))
        }}
        onDismiss={(id) => {
          dismissNotification(ownerKey, id)
          bumpNotifTick()
        }}
      />
    </div>
  )
}
