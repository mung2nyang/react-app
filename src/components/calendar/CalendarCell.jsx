// @ts-check
// 달력 셀 하나. 뱃지 문구/휴무/
// 미수 여부는 CalendarGrid가 domain(calendarBadges.js)으로 미리 계산해서 넘긴다 — 이
// 컴포넌트는 그 결과를 그리기만 한다(순수 표시).

/**
 * domain/calendar.js의 buildCalendarCells가 만드는 셀 하나의 모양(그 파일은 아직
 * // @ts-check가 없어 공식 타입을 내보내지 않는다 — 여기서 소비하는 형태만 정의).
 * @typedef {Object} CalendarCellData
 * @property {string} key
 * @property {number} [day]
 * @property {boolean} [empty]
 * @property {boolean} [sunday]
 * @property {boolean} [saturday]
 * @property {boolean} [today]
 */

/**
 * @param {Object} props
 * @param {CalendarCellData} props.cell
 * @param {string|null} props.badgeLabel
 * @param {string|null} [props.expenseBadgeLabel]
 * @param {boolean} props.isOff
 * @param {boolean} props.hasUnpaid
 * @param {(cell: CalendarCellData) => void} props.onSelect
 */
export default function CalendarCell({ cell, badgeLabel, expenseBadgeLabel, isOff, hasUnpaid, onSelect }) {
  return (
    <button
      type="button"
      disabled={cell.empty}
      className={[
        'date-cell',
        cell.empty ? 'empty' : '',
        cell.sunday ? 'sunday' : '',
        cell.saturday ? 'saturday' : '',
        cell.today ? 'today' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => {
        if (cell.empty) return
        onSelect(cell)
      }}
    >
      {!cell.empty && <span className="cell-date-text">{cell.day}</span>}
      {isOff && <span className="off-badge">휴무</span>}
      {!isOff && badgeLabel && <span className="work-badge">{badgeLabel}</span>}
      {expenseBadgeLabel && <span className="maint-badge">{expenseBadgeLabel}</span>}
      {/* 당일 미수 표시 점 — 장식이라 span + aria-hidden(화면 읽기 프로그램에서 숨김). */}
      {hasUnpaid && <span className="unpaid-dot" aria-hidden="true" />}
    </button>
  )
}
