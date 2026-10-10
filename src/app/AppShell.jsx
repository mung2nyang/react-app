// @ts-check
// `/app/*` 레이아웃 — 하단탭·사이드메뉴는 여기서 한 번만 마운트하고 화면은 중첩 라우트가 그린다.
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav.jsx'
import { PageSkeleton } from '../components/shared/Skeleton.jsx'
import SideMenu, { preloadSideMenuBanner } from '../components/SideMenu.jsx'
import PullRefreshIndicator from '../components/PullRefreshIndicator.jsx'
import { collectNotifications } from '../lib/notifications.js'
import { confirmLeaveIfUnsafe } from '../lib/durableWriteGuard.js'
import { useOwnerCars, useOwnerDrivers, useOwnerSettings } from '../store/ownerDataHooks.js'
import PageLoadErrorBoundary from '../components/PageLoadErrorBoundary.jsx'
import HydrationRetryBanner from './HydrationRetryBanner.jsx'
import AppShellRoutes from './AppShellRoutes.jsx'
import useBackToExit from './useBackToExit.js'
import usePageTransition from './usePageTransition.js'
import { withFromLogState } from './fromLogNavigation.js'
import { buildSubLogMenuItems } from './subLogMenuItems.js'

/** @typedef {import('../lib/outboxTypes.js').AppSession} AppSession */

// 옛 appPage 식별자 → 실제 라우트 경로. SideMenu/MyPage/알림패널이 공유한다.
/** @type {Record<string, string>} */
const PAGE_PATH = {
  home: '',
  cars: 'cars',
  clients: 'clients',
  expenses: 'expenses',
  receivables: 'receivables',
  report: 'report',
  invoices: 'report', // 세금계산서는 서류 발급 첫 탭(세금계산서 정리 ②)
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
 * @param {(session: AppSession) => void} [props.onSessionUpdate]
 */
export default function AppShell({ ownerKey, session, showToast, onBackToAuth, onGoAuth, onSessionUpdate }) {
  const location = useLocation()
  const rawNavigate = useNavigate()
  // 화면 이동은 모두 이 navigate를 거치므로 저장 안 된 편집 확인(durableWriteGuard)을 여기서 한 번에 건다.
  // (to, options)/(delta) 두 모양은 number 여부로 나눈다.
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
  const [notifTick, setNotifTick] = useState(0)
  useEffect(() => { preloadSideMenuBanner() }, [])
  useBackToExit(showToast)
  const pageBoxRef = usePageTransition()
  const drivers = useOwnerDrivers(ownerKey)
  const cars = useOwnerCars(ownerKey)
  const settings = useOwnerSettings(ownerKey)
  const isOwnerSession = !session?.linkedOwnerId
  const subLogItems = useMemo(
    () => buildSubLogMenuItems(cars, drivers, isOwnerSession),
    [cars, drivers, isOwnerSession],
  )
  const linkedDriverItems = useMemo(() => {
    if (!isOwnerSession) return []
    return drivers
      .filter((driver) => driver.status === 'linked')
      .map((driver) => ({
        linkId: driver.id,
        driverName: driver.name || '기사',
      }))
  }, [drivers, isOwnerSession])

  const notifications = useMemo(() => collectNotifications(ownerKey), [ownerKey, notifTick, drivers, settings])
  const bumpNotifTick = () => setNotifTick((n) => n + 1)

  const activeNav = location.pathname === '/app' || location.pathname === '/app/notifications'
    || (location.pathname.startsWith('/app/logs/') && !location.pathname.includes('/day/'))
    ? 'home'
    : location.pathname === '/app/calendar' || location.pathname.startsWith('/app/day/')
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
    navigate(backFallback ? `${pagePath(page)}?back=${backFallback}` : pagePath(page))
  }

  /** @param {string} tab */
  function selectTab(tab) {
    setMenuOpen(false)
    if (tab === 'work') {
      navigate('/app/calendar')
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
      <div ref={pageBoxRef} className="page-transition">
        <PageLoadErrorBoundary resetKey={location.pathname}>
        <Suspense fallback={<PageSkeleton path={location.pathname} onOpenMenu={() => setMenuOpen(true)} />}>
          <AppShellRoutes
            ownerKey={ownerKey}
            session={session}
            showToast={showToast}
            bumpNotifTick={bumpNotifTick}
            notifCount={notifications.length}
            onOpenMenu={() => setMenuOpen(true)}
            onOpenNotifs={() => { bumpNotifTick(); navigate('/app/notifications') }}
            onBackToAuth={onBackToAuth}
            onGoAuth={onGoAuth}
            onSessionUpdate={onSessionUpdate}
            navigate={navigate}
            goToPage={goToPage}
          />
        </Suspense>
        </PageLoadErrorBoundary>
      </div>
      <BottomNav active={activeNav} onSelect={selectTab} />
      <PullRefreshIndicator />
      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSelect={(/** @type {string} */ page, /** @type {string|undefined} */ title) => goToPage(page, title, 'home')}
        linkedDriverItems={linkedDriverItems}
        onOpenLinkedDriver={(/** @type {string} */ linkId) => {
          navigate(`/app/drivers/${encodeURIComponent(linkId)}`)
        }}
        subLogItems={subLogItems}
        onOpenSubLog={(/** @type {string} */ vehicleNumber) => {
          navigate(`/app/logs/${encodeURIComponent(vehicleNumber)}/manage`)
        }}
      />
    </div>
  )
}
