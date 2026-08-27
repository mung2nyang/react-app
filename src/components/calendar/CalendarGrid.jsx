// @ts-check
// Step 5(달력 홈 재작성): MainPage.jsx의 요일 헤더 + 날짜 셀 map을 옮긴다. 셀 하나하나의
// 뱃지/휴무/미수 계산을 domain 함수(calendarBadges.js)로 여기서 미리 해서 CalendarCell에는
// 이미 계산된 값만 넘긴다 — "domain에서 DayRecord → workBadge/isOff/hasUnpaid" 요구사항.
import { dayHasUnpaid, dayWorkBadgeLabel } from '../../domain/calendarBadges.js'
import { isOffDay } from '../../domain/day-record.js'
import CalendarCell from './CalendarCell.jsx'

/** @typedef {import('./CalendarCell.jsx').CalendarCellData} CalendarCellData */
/** @typedef {import('../../domain/calendarBadges.js').DayRecordLike} DayRecordLike */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/**
 * @param {Object} props
 * @param {Array<CalendarCellData>} props.cells
 * @param {number} props.month 1-based(달력 셀 클릭 시 넘길 월 — cell.day와 조합해 dateKey를 만든다)
 * @param {Record<string, DayRecordLike>} props.workData
 * @param {'count'|'fare'} props.inputMode
 * @param {number|string} props.unitPrice
 * @param {boolean} props.paymentOn
 * @param {(sel: { dateKey: string, month: number, day: number }) => void} props.onSelectDay
 */
export default function CalendarGrid({ cells, month, workData, inputMode, unitPrice, paymentOn, onSelectDay }) {
  return (
    <div className="calendar-grid">
      {WEEKDAYS.map((label, index) => (
        <div
          key={label}
          className={`day-header${index === 0 ? ' sunday' : ''}${index === 6 ? ' saturday' : ''}`}
        >
          {label}
        </div>
      ))}
      {cells.map((cell) => {
        const record = cell.empty ? null : workData[cell.key]
        return (
          <CalendarCell
            key={cell.key}
            cell={cell}
            isOff={isOffDay(record)}
            badgeLabel={dayWorkBadgeLabel(record, { inputMode, unitPrice })}
            hasUnpaid={dayHasUnpaid(record, paymentOn)}
            onSelect={() => onSelectDay({ dateKey: cell.key, month, day: /** @type {number} */ (cell.day) })}
          />
        )
      })}
    </div>
  )
}
