// @ts-check
// 세금계산서 위 카드: 달 이동만(계산서 종류 탭은 매출뿐이라 삭제, 2026-10-02).
import CalendarDateSelect from './calendar/CalendarDateSelect.jsx'
import { getYearOptions, setYearMonth, shiftMonth } from '../lib/calendar.js'
import './tax-invoice/tax-invoice.css'

const YEAR_OPTIONS = getYearOptions()

/**
 * @param {Object} props
 * @param {Date} props.viewDate
 * @param {(next: Date|((d: Date) => Date)) => void} props.setViewDate
 */
export default function TaxInvoiceToolbar({ viewDate, setViewDate }) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  return (
    <div className="tax-invoice-top-card">
      <div className="maint-fuel-nav">
        <div className="date-navigator">
          <button type="button" className="arrow-btn" title="이전 달" onClick={() => setViewDate((d) => shiftMonth(d, -1))}>
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <div className="date-select-group">
            <CalendarDateSelect
              label="년도 선택"
              value={year}
              options={YEAR_OPTIONS.map((y) => ({ value: String(y), label: `${y}년` }))}
              onChange={(next) => setViewDate(setYearMonth(viewDate, Number(next), month))}
            />
            <CalendarDateSelect
              label="월 선택"
              value={month}
              options={Array.from({ length: 12 }, (_, m) => ({ value: String(m), label: `${m + 1}월` }))}
              onChange={(next) => setViewDate(setYearMonth(viewDate, year, Number(next)))}
            />
          </div>
          <button type="button" className="arrow-btn" title="다음 달" onClick={() => setViewDate((d) => shiftMonth(d, 1))}>
            <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
