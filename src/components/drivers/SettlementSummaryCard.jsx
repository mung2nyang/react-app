// @ts-check
import CalendarDateSelect from '../calendar/CalendarDateSelect.jsx'
import { getYearOptions } from '../../lib/calendar.js'
import { formatWon } from '../../lib/money.js'
import { getDriverSettlementBreakdown } from '../../domain/driverIncomeDeductions.js'

const YEAR_OPTIONS = getYearOptions()

/**
 * 공제 금액 — 0원이면 빼기 기호 없이
 * @param {number} amount
 */
function deductionWon(amount) {
  return `${Number(amount) > 0 ? '-' : ''}${formatWon(amount)}`
}

/**
 * detail은 getLinkedDriverSettlementDetail 결과에 그 기사차량(car)을 실은 것 — 카드는 car의 산재·원천징수 설정으로 계산한다.
 * @typedef {{ tripCount?: number, totalFare?: number, commissionAmount?: number, car?: import('../../domain/financeTypes.js').CarLike }} SettlementDetail
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
  const breakdown = getDriverSettlementBreakdown(detail, detail?.car)
  return (
    <section className="tax-invoice-summary" id="linkedDriverSettlementSummary">
      <div className="date-navigator" style={{ marginBottom: 12 }}>
        <button type="button" className="arrow-btn" title="이전 달" onClick={onPrevMonth}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="date-select-group">
          <CalendarDateSelect
            label="년도 선택"
            value={year}
            options={YEAR_OPTIONS.map((y) => ({ value: String(y), label: `${y}년` }))}
            onChange={(next) => onYearChange(Number(next))}
          />
          <CalendarDateSelect
            label="월 선택"
            value={month}
            options={Array.from({ length: 12 }, (_, i) => ({ value: String(i), label: `${i + 1}월` }))}
            onChange={(next) => onMonthChange(Number(next))}
          />
        </div>
        <button type="button" className="arrow-btn" title="다음 달" onClick={onNextMonth}>
          <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>
      <div className="summary-title"><span>기사 정산</span><span>{detail?.tripCount || 0}건</span></div>
      <div className="summary-row"><span>총 운송료</span><span className="summary-value">{formatWon(breakdown.totalFare)}</span></div>
      <div className="summary-row"><span>기사 정산금</span><span className="summary-value">{formatWon(breakdown.settlementAmount)}</span></div>
      <div className="summary-row"><span>산재보험 (기사 몫)</span><span className="summary-value">{deductionWon(breakdown.insuranceDriverShare)}</span></div>
      <div className="summary-row"><span>원천징수 (3.3%)</span><span className="summary-value">{deductionWon(breakdown.withholding)}</span></div>
      <div className="summary-row total"><span>최종 실수령 정산액</span><span className="summary-value">{formatWon(breakdown.driverNet)}</span></div>
    </section>
  )
}
