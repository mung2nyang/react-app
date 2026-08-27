// @ts-check
// Step 5(달력 홈 재작성): MainPage.jsx의 달력 셀 렌더링을 그대로 옮긴다. 뱃지 문구/휴무/
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
 * @param {boolean} props.isOff
 * @param {boolean} props.hasUnpaid
 * @param {(cell: CalendarCellData) => void} props.onSelect
 */
export default function CalendarCell({ cell, badgeLabel, isOff, hasUnpaid, onSelect }) {
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
      {/* 바닐라 script.js의 .unpaid-dot(당일 미수 콜상세 표시) — 이 react 포트에는 아직
          없던 뱃지라 Step 5에서 새로 옮긴다. button 안에는 인터랙티브하지 않은 순수
          장식 표시라 div보다 span이 맞고(재감사 2차), 별도로 읽어 줄 텍스트가 없으니
          aria-hidden으로 스크린리더에서 숨긴다(미수 여부 자체는 셀의 다른 정보로도
          전달되지 않으므로 장식 표시로만 취급한다 — 사용자 지시). */}
      {hasUnpaid && <span className="unpaid-dot" aria-hidden="true" />}
    </button>
  )
}
