// @ts-check
// 요일 헤더 + 날짜 셀. 셀 뱃지/휴무/미수는 여기서 calendarBadges.js로 미리 계산해 CalendarCell에 넘긴다.
import { dayExpenseBadgeLabel, dayHasUnpaid, dayWorkBadgeLabel } from '../../domain/calendarBadges.js'
import { isOffDay } from '../../domain/day-record.js'
import CalendarCell from './CalendarCell.jsx'

/** @typedef {import('./CalendarCell.jsx').CalendarCellData} CalendarCellData */
/** @typedef {import('../../domain/calendarBadges.js').DayRecordLike} DayRecordLike */
/** @typedef {import('../../domain/expenseTypes.js').ExpenseItem} ExpenseItem */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/**
 * @param {Object} props
 * @param {Array<CalendarCellData>} props.cells
 * @param {number} props.month 1-based(달력 셀 클릭 시 넘길 월 — cell.day와 조합해 dateKey를 만든다)
 * @param {Record<string, DayRecordLike>} props.workData
 * @param {'count'|'fare'} props.inputMode
 * @param {number|string} props.unitPrice
 * @param {boolean} props.paymentOn
 * @param {Array<ExpenseItem>} [props.expenses] 지출 칩용(메인/서브 공통)
 * @param {string} [props.expenseVehicle] 서브면 logId(차량번호), 메인이면 생략
 * @param {(sel: { dateKey: string, month: number, day: number }) => void} props.onSelectDay
 */
export default function CalendarGrid({ cells, month, workData, inputMode, unitPrice, paymentOn, expenses, expenseVehicle, onSelectDay }) {
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
            expenseBadgeLabel={cell.empty ? null : dayExpenseBadgeLabel(expenses, cell.key, expenseVehicle)}
            hasUnpaid={dayHasUnpaid(record, paymentOn)}
            onSelect={() => onSelectDay({ dateKey: cell.key, month, day: /** @type {number} */ (cell.day) })}
          />
        )
      })}
    </div>
  )
}
