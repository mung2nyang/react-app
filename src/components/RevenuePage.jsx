// @ts-check
// 재감사 2차(FAIL 지적) — 이 파일은 원래 352줄짜리 단일 모듈이었다("기존 대형
// 파일이니 예외"로 두지 말라는 지시). src/components/revenue/ 폴더로 실제 분할했다:
// revenueFormat.js(공용 포맷 함수) + RevenueNav.jsx(PageShell/DateNav) +
// OwnerMonthlyCards.jsx(오너 손익 카드) + OwnerRevenueView.jsx/DriverRevenueView.jsx
// (계정 유형별 화면 전체). 이 파일은 계정 유형에 따라 둘 중 하나를 고르는
// 오케스트레이션만 남았다 — day-log/DayLogPage.jsx, calendar/CalendarPage.jsx와
// 같은 분할 관례다. import 경로('./RevenuePage.jsx')는 그대로라 AppShell.jsx/
// lazyPages.js는 안 고쳐도 된다.
import { PageShell } from './revenue/RevenueNav.jsx'
import OwnerRevenueView from './revenue/OwnerRevenueView.jsx'
import DriverRevenueView from './revenue/DriverRevenueView.jsx'
import '../main-calendar.css'

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {{ accountType?: string }} [props.session]
 * @param {() => void} props.onBack
 */
export default function RevenuePage({ ownerKey = 'guest', session, onBack }) {
  const isDriver = session?.accountType === 'employed_driver'

  return (
    <PageShell title="매출" onBack={onBack}>
      {isDriver ? <DriverRevenueView ownerKey={ownerKey} /> : <OwnerRevenueView ownerKey={ownerKey} />}
    </PageShell>
  )
}
