// @ts-check
import AppTopBar from '../shared/AppTopBar.jsx'
import CalendarDateSelect from './CalendarDateSelect.jsx'

/**
 * @param {Object} props
 * @param {number} props.year
 * @param {number} props.month 0-based
 * @param {Array<number>} props.yearOptions
 * @param {(year: number, month: number) => void} props.onChangeMonth 월이 -1/12처럼 범위를 벗어나도(이전/다음 달 이동) 그대로 넘긴다 — new Date()가 알아서 연도로 넘긴다.
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function CalendarHeader({
  year,
  month,
  yearOptions,
  onChangeMonth,
  onOpenMenu,
}) {
  return (
    <>
      <AppTopBar onOpenMenu={onOpenMenu} />
      <div className="header">
        <div className="date-navigator">
          <button type="button" className="arrow-btn" title="이전 달" onClick={() => onChangeMonth(year, month - 1)}>
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>

          <div className="date-select-group">
            <CalendarDateSelect
              label="년도 선택"
              value={year}
              options={yearOptions.map((y) => ({ value: String(y), label: `${y}년` }))}
              onChange={(next) => onChangeMonth(Number(next), month)}
            />
            <CalendarDateSelect
              label="월 선택"
              value={month}
              options={Array.from({ length: 12 }, (_, m) => ({ value: String(m), label: `${m + 1}월` }))}
              onChange={(next) => onChangeMonth(year, Number(next))}
            />
          </div>

          <button type="button" className="arrow-btn" title="다음 달" onClick={() => onChangeMonth(year, month + 1)}>
            <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      </div>
    </>
  )
}
