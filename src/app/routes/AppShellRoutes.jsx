// @ts-check
// AppShell 라우트 트리만 분리(200줄). 셸 크롬(탭/메뉴/알림)은 AppShell.jsx에 남긴다.
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import HomePage from '../../features/home/ui/HomePage.jsx'
import ComingSoonRoute from './ComingSoonRoute.jsx'
import MainPageRoute from './MainPageRoute.jsx'
import {
  AppSettingsPage,
  CarManagementPage,
  ClientManagementPage,
  DriverConnectionPage,
  LinkedDriverClientsPage,
  LinkedDriverManagementPage,
  MaintFuelPage,
  MyPage,
  OwnerScopedClientsView,
  PersonalInfoPage,
  ReceivablesPage,
  DocumentIssuePage,
  RevenuePage,
  CustomerCenterPage,
  NoticePage,
  MessageSettingsPage,
  NotificationsPage,
} from './lazyPages.js'

/** @typedef {import('../../data/sync/syncTypes.js').AppSession} AppSession */

/**
 * @param {Object} props
 * @param {string} props.ownerKey
 * @param {AppSession|null} props.session
 * @param {number} props.notifCount
 * @param {() => void} props.onOpenMenu
 * @param {() => void} props.onOpenNotifs
 * @param {() => void} [props.onBackToAuth]
 * @param {() => void} [props.onGoAuth]
 * @param {(session: AppSession) => void} [props.onSessionUpdate]
 * @param {(to: import('react-router-dom').To | number, options?: import('react-router-dom').NavigateOptions) => void} props.navigate
 * @param {(target: string) => void} props.goBack 화면 위 ← (로드맵 63)
 * @param {(page: string, title?: string, backFallback?: string) => void} props.goToPage
 */
export default function AppShellRoutes({
  ownerKey, session, notifCount,
  onOpenMenu, onOpenNotifs, onBackToAuth, onGoAuth, onSessionUpdate, navigate, goBack, goToPage,
}) {
  const [params] = useSearchParams()
  const backTarget = params.get('back') === 'mypage' ? '/app/me' : '/app'

  function mainPage() {
    return (
      <MainPageRoute
        ownerKey={ownerKey}
        session={session}
        userName={session?.name}
        onOpenMenu={onOpenMenu}
        onBackToAuth={onBackToAuth}
      />
    )
  }
  return (
    <Routes>
      <Route index element={<HomePage ownerKey={ownerKey} session={session} notifCount={notifCount} onOpenMenu={onOpenMenu} onOpenNotifs={onOpenNotifs} onOpenToday={(/** @type {string} */ dateKey) => navigate(`/app/day/${dateKey}`, { state: { from: 'home' } })} onOpenReceivables={() => goToPage('receivables', undefined, 'home')} onOpenCalendar={() => navigate('/app/calendar')} />} />
      <Route path="calendar" element={mainPage()} />
      <Route path="day/:date" element={mainPage()} />
      <Route path="logs/:logId/manage" element={<LinkedDriverManagementPage ownerKey={ownerKey} onBack={() => navigate(-1)} onOpenMenu={onOpenMenu} />} />
      <Route path="logs/:logId/clients" element={<LinkedDriverClientsPage ownerKey={ownerKey} onBack={() => navigate(-1)} onOpenMenu={onOpenMenu} />} />
      <Route path="logs/:logId/expenses" element={<MaintFuelPage ownerKey={ownerKey} onBack={() => navigate(-1)} onOpenMenu={onOpenMenu} />} />
      <Route path="logs/:logId/report" element={<DocumentIssuePage ownerKey={ownerKey} isEmployedDriver={session?.accountType === 'employed_driver'} onBack={() => navigate(-1)} onOpenMenu={onOpenMenu} />} />
      <Route path="logs/:logId/settings" element={<AppSettingsPage ownerKey={ownerKey} session={session} onBack={() => navigate(-1)} onOpenMenu={onOpenMenu} />} />
      <Route path="logs/:logId/day/:date" element={mainPage()} />
      <Route path="logs/:logId" element={mainPage()} />
      <Route path="cars" element={<CarManagementPage ownerKey={ownerKey} session={session} onBack={() => goBack(backTarget)} onOpenMenu={onOpenMenu} />} />
      <Route
        path="clients"
        element={
          session?.linkedOwnerId ? (
            <OwnerScopedClientsView ownerKey={ownerKey} onBack={() => goBack(backTarget)} onOpenMenu={onOpenMenu} />
          ) : (
            <ClientManagementPage ownerKey={ownerKey} onBack={() => goBack(backTarget)} onOpenMenu={onOpenMenu} />
          )
        }
      />
      <Route path="me" element={<MyPage session={session ?? undefined} ownerKey={ownerKey} onLinked={(/** @type {AppSession} */ next) => { onSessionUpdate?.(next); navigate('/app') }} onOpen={(/** @type {string} */ page, /** @type {string | undefined} */ title) => goToPage(page, title, 'mypage')} onOpenMenu={onOpenMenu} />} />
      <Route path="me/profile" element={<PersonalInfoPage ownerKey={ownerKey} session={session} onBack={() => goBack(backTarget)} onGoAuth={onGoAuth} onOpenMenu={onOpenMenu} onUnlinked={(/** @type {AppSession} */ next) => { onSessionUpdate?.(next); goBack('/app') }} />} />
      <Route path="me/settings" element={<AppSettingsPage ownerKey={ownerKey} session={session} onBack={() => goBack(backTarget)} onOpenMenu={onOpenMenu} />} />
      <Route path="expenses" element={<MaintFuelPage ownerKey={ownerKey} onBack={() => goBack(backTarget)} onOpenMenu={onOpenMenu} />} />
      <Route path="receivables/*" element={<ReceivablesPage ownerKey={ownerKey} isEmployedDriver={session?.accountType === 'employed_driver'} onBack={() => goBack(backTarget)} onOpenMenu={onOpenMenu} />} />
      <Route path="report" element={<DocumentIssuePage ownerKey={ownerKey} isEmployedDriver={session?.accountType === 'employed_driver'} onBack={() => goBack(backTarget)} onOpenMenu={onOpenMenu} />} />
      <Route path="tax" element={<Navigate to="/app/report" replace />} />
      <Route path="drivers/:linkId/clients" element={<LinkedDriverClientsPage ownerKey={ownerKey} onBack={() => navigate(-1)} onOpenMenu={onOpenMenu} />} />
      <Route path="drivers/:linkId" element={<LinkedDriverManagementPage ownerKey={ownerKey} onBack={() => navigate(-1)} onOpenMenu={onOpenMenu} />} />
      <Route path="drivers" element={<DriverConnectionPage ownerKey={ownerKey} session={session} navigate={navigate} onBack={() => goBack('/app/me')} />} />
      <Route path="revenue" element={<RevenuePage ownerKey={ownerKey} session={session ?? undefined} onOpenMenu={onOpenMenu} />} />
      <Route path="support" element={<CustomerCenterPage session={session} onGoAuth={onGoAuth} onBack={() => goBack('/app')} onOpenMenu={onOpenMenu} />} />
      <Route path="notice" element={<NoticePage onBack={() => goBack(backTarget)} onOpenMenu={onOpenMenu} />} />
      <Route path="message-settings" element={<MessageSettingsPage onBack={() => goBack(backTarget)} />} />
      <Route path="notifications" element={<NotificationsPage ownerKey={ownerKey} session={session} onBack={() => navigate(-1)} onOpenMenu={onOpenMenu} onOpenPage={(/** @type {string} */ page) => goToPage(page)} />} />
      <Route path="soon" element={<ComingSoonRoute />} />
    </Routes>
  )
}
