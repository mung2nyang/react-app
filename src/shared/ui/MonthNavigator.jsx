// @ts-check
// 여러 화면이 같이 쓰는 달 이동(이전 달·년·월 선택·다음 달) — 서류 발급 탭들과 차량 유지비.
import { getYearOptions, setYearMonth, shiftMonth } from '../../domain/calendar.js'
import CalendarDateSelect from './CalendarDateSelect.jsx'

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
