// @ts-check
import { getYearOptions } from '../../lib/calendar.js'
import { formatWon } from '../../lib/money.js'

const YEAR_OPTIONS = getYearOptions()

/**
 * @typedef {{ tripCount?: number, totalFare?: number, commissionAmount?: number, insuranceAmount?: number, finalAmount?: number }} SettlementDetail
 */

/**
 * @param {Object} props
 * @param {Date} props.viewDate
 * @param {() => void} props.onPrevMonth
 * @param {() => void} props.onNextMonth
 * @param {(year: number) => void} props.onYearChange
 * @param {(month: number) => void} props.onMonthChange
 * @param {SettlementDetail|null} props.detail
 */
export default function SettlementSummaryCard({
  viewDate, onPrevMonth, onNextMonth, onYearChange, onMonthChange, detail,
}) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  return (
    <section className="tax-invoice-summary" id="linkedDriverSettlementSummary">
      <div className="date-navigator" style={{ marginBottom: 12 }}>
        <button type="button" className="arrow-btn" title="이전 달" onClick={onPrevMonth}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="date-select-group">
          <select className="date-select" value={year} onChange={(e) => onYearChange(Number(e.target.value))}>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select className="date-select" value={month} onChange={(e) => onMonthChange(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{i + 1}월</option>)}
          </select>
        </div>
        <button type="button" className="arrow-btn" title="다음 달" onClick={onNextMonth}>
          <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>
      <div className="summary-title"><span>기사 정산</span><span>{detail?.tripCount || 0}건</span></div>
      <div className="summary-row"><span>총 운송료</span><span className="summary-value">{formatWon(detail?.totalFare || 0)}</span></div>
      <div className="summary-row"><span>수수료</span><span className="summary-value">-{formatWon(detail?.commissionAmount || 0)}</span></div>
      <div className="summary-row"><span>산재보험</span><span className="summary-value">-{formatWon(detail?.insuranceAmount || 0)}</span></div>
      <div className="summary-row total"><span>최종 정산액</span><span className="summary-value">{formatWon(detail?.finalAmount || 0)}</span></div>
    </section>
  )
}
