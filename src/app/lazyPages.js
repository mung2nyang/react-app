// Step 3 라우터 셸: AppShell.jsx가 쓰는 지연 로드 페이지 컴포넌트를 한 곳에 모은다
// (App.jsx가 원래 갖고 있던 lazy() 목록과 동일 — 파일만 분리, 동작 무변경).
import { lazy } from 'react'

export const CarManagementPage = lazy(() => import('../components/CarManagementPage.jsx'))
export const ClientManagementPage = lazy(() => import('../components/ClientManagementPage.jsx'))
export const PersonalInfoPage = lazy(() => import('../components/PersonalInfoPage.jsx'))
export const AppSettingsPage = lazy(() => import('../components/AppSettingsPage.jsx'))
export const MaintFuelPage = lazy(() => import('../components/MaintFuelPage.jsx'))
export const ReceivablesPage = lazy(() => import('../components/ReceivablesPage.jsx'))
export const ReportPage = lazy(() => import('../components/ReportPage.jsx'))
export const TaxInvoicePage = lazy(() => import('../components/TaxInvoicePage.jsx'))
export const DriverConnectionPage = lazy(() => import('../components/DriverConnectionPage.jsx'))
export const LinkedDriverManagementPage = lazy(() => import('../components/drivers/LinkedDriverManagementPage.jsx'))
export const LinkedDriverClientsPage = lazy(() => import('../components/drivers/LinkedDriverClientsPage.jsx'))
export const BillingSettingsPage = lazy(() => import('../components/drivers/BillingSettingsPage.jsx'))
export const InviteRedeemPage = lazy(() => import('../components/InviteRedeemPage.jsx'))
export const ComingSoonPage = lazy(() => import('../components/ComingSoonPage.jsx'))
export const RevenuePage = lazy(() => import('../components/RevenuePage.jsx'))
export const MyPage = lazy(() => import('../components/MyPage.jsx'))
