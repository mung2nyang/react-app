// @ts-check
// AppShell 라우트 트리만 분리(200줄). 셸 크롬(탭/메뉴/알림)은 AppShell.jsx에 남긴다.
import { Route, Routes, useSearchParams } from 'react-router-dom'
import ComingSoonRoute from './ComingSoonRoute.jsx'
import MainPageRoute from './MainPageRoute.jsx'
import {
  AppSettingsPage,
  BillingSettingsPage,
  CarManagementPage,
  ClientManagementPage,
  DriverConnectionPage,
  InviteRedeemPage,
  LinkedDriverClientsPage,
  LinkedDriverManagementPage,
  MaintFuelPage,
  MyPage,
  OwnerScopedClientsView,
  PersonalInfoPage,
  ReceivablesPage,
  ReportPage,
  RevenuePage,
  TaxInvoicePage,
  CustomerCenterPage,
  NoticePage,
  MessageSettingsPage,
} from './lazyPages.js'

/** @typedef {import('../lib/outboxTypes.js').AppSession} AppSession */

/**
 * @param {Object} props
 * @param {string} props.ownerKey
 * @param {AppSession|null} props.session
 * @param {(message: string) => void} [props.showToast]
 * @param {() => void} props.bumpNotifTick
 * @param {number} props.notifCount
 * @param {() => void} props.onOpenMenu
 * @param {() => void} props.onOpenNotifs
 * @param {() => void} [props.onBackToAuth]
 * @param {() => void} [props.onGoAuth]
 * @param {(session: AppSession) => void} [props.onSessionUpdate]
 * @param {(to: import('react-router-dom').To | number, options?: import('react-router-dom').NavigateOptions) => void} props.navigate
 * @param {(page: string, title?: string, backFallback?: string) => void} props.goToPage
 */
export default function AppShellRoutes({
  ownerKey, session, showToast, bumpNotifTick, notifCount,
  onOpenMenu, onOpenNotifs, onBackToAuth, onGoAuth, onSessionUpdate, navigate, goToPage,
}) {
  const [params] = useSearchParams()
  const backTarget = params.get('back') === 'mypage' ? '/app/me' : '/app'

  function mainPage() {
    return (
      <MainPageRoute
        ownerKey={ownerKey}
        userName={session?.name}
        showToast={showToast}
        onWorkChanged={bumpNotifTick}
        notifCount={notifCount}
        onOpenMenu={onOpenMenu}
        onOpenNotifs={onOpenNotifs}
        onBackToAuth={onBackToAuth}
      />
    )
  }
  return (
    <Routes>
      <Route index element={mainPage()} />
      <Route path="day/:date" element={mainPage()} />
      <Route path="logs/:logId/manage" element={<LinkedDriverManagementPage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate(-1)} onOpenMenu={onOpenMenu} />} />
      <Route path="logs/:logId/clients" element={<LinkedDriverClientsPage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate(-1)} />} />
      <Route path="logs/:logId/expenses" element={<MaintFuelPage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate(-1)} onOpenMenu={onOpenMenu} />} />
      <Route path="logs/:logId/day/:date" element={mainPage()} />
      <Route path="logs/:logId" element={mainPage()} />
      <Route path="cars" element={<CarManagementPage ownerKey={ownerKey} session={session} showToast={showToast} onBack={() => navigate(backTarget)} onOpenMenu={onOpenMenu} />} />
      <Route
        path="clients"
        element={
          session?.linkedOwnerId ? (
            <OwnerScopedClientsView ownerKey={ownerKey} showToast={showToast} onBack={() => navigate(backTarget)} onOpenMenu={onOpenMenu} />
          ) : (
            <ClientManagementPage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate(backTarget)} onOpenMenu={onOpenMenu} />
          )
        }
      />
      <Route path="me" element={<MyPage session={session ?? undefined} ownerKey={ownerKey} onOpen={(/** @type {string} */ page, /** @type {string | undefined} */ title) => goToPage(page, title, 'mypage')} onBack={() => navigate('/app')} onOpenMenu={onOpenMenu} />} />
      <Route path="me/profile" element={<PersonalInfoPage ownerKey={ownerKey} session={session} showToast={showToast} onBack={() => navigate(backTarget)} onGoAuth={onGoAuth} onOpenMenu={onOpenMenu} />} />
      <Route path="me/settings" element={<AppSettingsPage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate(backTarget)} onOpenMenu={onOpenMenu} />} />
      <Route path="expenses" element={<MaintFuelPage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate(backTarget)} onOpenMenu={onOpenMenu} />} />
      <Route path="receivables/*" element={<ReceivablesPage ownerKey={ownerKey} showToast={showToast} onWorkChanged={bumpNotifTick} onBack={() => { navigate(backTarget); bumpNotifTick() }} onOpenMenu={onOpenMenu} />} />
      <Route path="report" element={<ReportPage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate(backTarget)} onOpenMenu={onOpenMenu} />} />
      <Route path="tax" element={<TaxInvoicePage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate(backTarget)} onOpenMenu={onOpenMenu} />} />
      <Route path="drivers/:linkId/clients" element={<LinkedDriverClientsPage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate(-1)} />} />
      <Route path="drivers/:linkId/billing" element={<BillingSettingsPage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate(-1)} />} />
      <Route path="drivers/:linkId" element={<LinkedDriverManagementPage ownerKey={ownerKey} showToast={showToast} onBack={() => navigate(-1)} onOpenMenu={onOpenMenu} />} />
      <Route path="drivers" element={<DriverConnectionPage ownerKey={ownerKey} session={session} showToast={showToast} navigate={navigate} onBack={() => { navigate('/app/me'); bumpNotifTick() }} />} />
      <Route path="me/invite" element={<InviteRedeemPage session={session} showToast={showToast} onBack={() => navigate('/app/me')} onLinked={(/** @type {AppSession} */ next) => { onSessionUpdate?.(next); navigate('/app') }} />} />
      <Route path="revenue" element={<RevenuePage ownerKey={ownerKey} session={session ?? undefined} onBack={() => navigate('/app')} />} />
      <Route path="support" element={<CustomerCenterPage session={session} showToast={showToast} onGoAuth={onGoAuth} onBack={() => navigate('/app')} />} />
      <Route path="notice" element={<NoticePage onBack={() => navigate(backTarget)} onOpenMenu={onOpenMenu} />} />
      <Route path="message-settings" element={<MessageSettingsPage onBack={() => navigate(backTarget)} showToast={showToast} />} />
      <Route path="soon" element={<ComingSoonRoute />} />
    </Routes>
  )
}
