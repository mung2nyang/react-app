// @ts-check
// Step 3 라우터 셸: `/app/*` 레이아웃 라우트. App.jsx의 옛 `screen==='home'` 블록을
// 그대로 옮긴 자리 — 하단탭/사이드메뉴/알림패널은 여기서 한 번만 마운트하고,
// 화면별 콘텐츠는 중첩 <Routes>의 Outlet 자리에서 페이지 컴포넌트가 그린다.
import { Suspense, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav.jsx'
import SideMenu from '../components/SideMenu.jsx'
import NotificationPanel from '../components/NotificationPanel.jsx'
import { collectNotifications, dismissNotification } from '../lib/notifications.js'
import { todayWorkLogSelection } from '../lib/calendar.js'
import { confirmLeaveIfUnsafe } from '../lib/durableWriteGuard.js'
import { useOwnerCars, useOwnerDrivers } from '../store/ownerDataHooks.js'
import HydrationRetryBanner from './HydrationRetryBanner.jsx'
import AppShellRoutes from './AppShellRoutes.jsx'
import { withFromLogState } from './fromLogNavigation.js'
import { buildSubLogMenuItems } from './subLogMenuItems.js'

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
  invite: 'me/invite',
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
 * @param {(session: AppSession) => void} [props.onSessionUpdate]
 */
export default function AppShell({ ownerKey, session, showToast, onBackToAuth, onGoAuth, onSessionUpdate }) {
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
    rawNavigate(to, withFromLogState(location.pathname, to, options))
  }
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifTick, setNotifTick] = useState(0)
  const drivers = useOwnerDrivers(ownerKey)
  const cars = useOwnerCars(ownerKey)
  const isOwnerSession = !session?.linkedOwnerId
  const subLogItems = useMemo(
    () => buildSubLogMenuItems(cars, isOwnerSession),
    [cars, isOwnerSession],
  )

  const notifications = useMemo(() => collectNotifications(ownerKey), [ownerKey, notifTick, drivers])
  const bumpNotifTick = () => setNotifTick((n) => n + 1)

  const activeNav = location.pathname === '/app'
    || (location.pathname.startsWith('/app/logs/') && !location.pathname.includes('/day/'))
    ? 'home'
    : location.pathname.startsWith('/app/day/')
      || (location.pathname.startsWith('/app/logs/') && location.pathname.includes('/day/'))
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
        <AppShellRoutes
          ownerKey={ownerKey}
          session={session}
          showToast={showToast}
          bumpNotifTick={bumpNotifTick}
          notifCount={notifications.length}
          onOpenMenu={() => setMenuOpen(true)}
          onOpenNotifs={() => { bumpNotifTick(); setNotifOpen(true) }}
          onBackToAuth={onBackToAuth}
          onGoAuth={onGoAuth}
          onSessionUpdate={onSessionUpdate}
          navigate={navigate}
          goToPage={goToPage}
        />
      </Suspense>
      <BottomNav active={activeNav} onSelect={selectTab} />
      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSelect={(/** @type {string} */ page, /** @type {string|undefined} */ title) => goToPage(page, title, 'home')}
        subLogItems={subLogItems}
        onOpenSubLog={(/** @type {string} */ vehicleNumber) => {
          navigate(`/app/logs/${encodeURIComponent(vehicleNumber)}`)
        }}
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
