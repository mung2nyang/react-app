// @ts-check
// 차주·연동 기사 매출 화면이 같이 쓰는 위 카드(날짜 이동 + 년/월 단추)와 년 매출 목록.
import { DateNav } from './RevenueNav.jsx'
import { won } from './revenueFormat.js'

/**
 * @param {Object} props
 * @param {ReturnType<typeof import('./revenuePeriod.js').useRevenuePeriod>} props.period
 * @param {import('react').ReactNode} [props.children] 년/월 단추 아래(차주 범위 탭·기사 고르기)
 */
export function RevenuePeriodBar({ period, children }) {
  const { yearly, viewDate, year, month, setViewDate, setTab, shift } = period
  return (
    <div className="revenue-top-card">
      <div className="maint-fuel-nav">
        <DateNav yearly={yearly} viewDate={viewDate} year={year} month={month} onViewDate={setViewDate} onShift={shift} />
      </div>
      <div className="settings-segmented-control maint-fuel-tabs">
        <button type="button" className={`toggle-btn${yearly ? ' active-work' : ''}`} onClick={() => setTab('yearly')}>년 매출</button>
        <button type="button" className={`toggle-btn${!yearly ? ' active-work' : ''}`} onClick={() => setTab('monthly')}>월 매출</button>
      </div>
      {children}
    </div>
  )
}

/** @param {{ year: number, rows: Array<{ month: number, netProfit: number }> }} props */
export function RevenueYearList({ year, rows }) {
  const yearNet = rows.reduce((sum, row) => sum + row.netProfit, 0)
  return (
    <>
      <div className="revenue-year-list">
        {rows.map((row) => (
          <div key={row.month} className="revenue-year-row">
            <span>{row.month}월</span>
            <span className={row.netProfit < 0 ? 'negative' : ''}>{won(row.netProfit)}</span>
          </div>
        ))}
      </div>
      <div className="revenue-year-total">
        <span>{year}년 순이익 합계</span>
        <strong className={yearNet < 0 ? 'negative' : ''}>{won(yearNet)}</strong>
      </div>
    </>
  )
}
