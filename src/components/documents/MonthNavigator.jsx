// @ts-check
// 서류 발급(9-C-1): ReportPage.jsx의 달 이동(이전 달·년·월 선택·다음 달)을 그대로 옮긴 공용 부품 — 운송비 내역서·일상점검표 탭이 같이 쓴다.
import { getYearOptions, setYearMonth, shiftMonth } from '../../lib/calendar.js'
import CalendarDateSelect from '../calendar/CalendarDateSelect.jsx'

const YEAR_OPTIONS = getYearOptions()

/** @param {{ viewDate: Date, onChange: (next: Date) => void }} props */
export default function MonthNavigator({ viewDate, onChange }) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  return (
    <div className="maint-fuel-nav">
      <div className="date-navigator">
        <button type="button" className="arrow-btn" title="이전 달" onClick={() => onChange(shiftMonth(viewDate, -1))}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="date-select-group">
          <CalendarDateSelect
            label="년도 선택"
            value={year}
            options={YEAR_OPTIONS.map((y) => ({ value: String(y), label: `${y}년` }))}
            onChange={(next) => onChange(setYearMonth(viewDate, Number(next), month))}
          />
          <CalendarDateSelect
            label="월 선택"
            value={month}
            options={Array.from({ length: 12 }, (_, m) => ({ value: String(m), label: `${m + 1}월` }))}
            onChange={(next) => onChange(setYearMonth(viewDate, year, Number(next)))}
          />
        </div>
        <button type="button" className="arrow-btn" title="다음 달" onClick={() => onChange(shiftMonth(viewDate, 1))}>
          <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>
    </div>
  )
}
