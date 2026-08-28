// @ts-check
// 재감사 2차(FAIL 지적) — RevenuePage.jsx 분할 조각: 화면 껍데기(PageShell)와
// 연/월 이동 네비게이션(DateNav) — OwnerRevenueView/DriverRevenueView 둘 다 쓴다.
import { getYearOptions, setYearMonth } from '../../lib/calendar.js'

const YEAR_OPTIONS = getYearOptions()

/**
 * @param {Object} props
 * @param {string} props.title
 * @param {() => void} props.onBack
 * @param {import('react').ReactNode} props.children
 */
export function PageShell({ title, onBack, children }) {
  return (
    <div className="page revenue-page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">{title}</div>
        <div style={{ width: 40 }}></div>
      </div>
      {children}
    </div>
  )
}

/**
 * @param {Object} props
 * @param {boolean} props.yearly
 * @param {Date} props.viewDate
 * @param {number} props.year
 * @param {number} props.month
 * @param {(date: Date) => void} props.onViewDate
 * @param {(delta: number) => void} props.onShift
 */
export function DateNav({ yearly, viewDate, year, month, onViewDate, onShift }) {
  return (
    <div className="date-navigator">
      <button type="button" className="arrow-btn" title={yearly ? '이전 해' : '이전 달'} onClick={() => onShift(-1)}>
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>
      <div className="date-select-group">
        <select className="date-select" value={year} onChange={(e) => onViewDate(setYearMonth(viewDate, Number(e.target.value), month))}>
          {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
        {!yearly && (
          <select className="date-select" value={month} onChange={(e) => onViewDate(setYearMonth(viewDate, year, Number(e.target.value)))}>
            {Array.from({ length: 12 }, (_, m) => <option key={m} value={m}>{m + 1}월</option>)}
          </select>
        )}
      </div>
      <button type="button" className="arrow-btn" title={yearly ? '다음 해' : '다음 달'} onClick={() => onShift(1)}>
        <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
    </div>
  )
}
