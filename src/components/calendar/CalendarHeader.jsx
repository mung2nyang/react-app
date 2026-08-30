// @ts-check
import CalendarDateSelect from './CalendarDateSelect.jsx'

const BANNER = '/images/banner_image.png'

/**
 * @param {Object} props
 * @param {number} props.year
 * @param {number} props.month 0-based
 * @param {Array<number>} props.yearOptions
 * @param {(year: number, month: number) => void} props.onChangeMonth 월이 -1/12처럼 범위를 벗어나도(이전/다음 달 이동) 그대로 넘긴다 — new Date()가 알아서 연도로 넘긴다.
 * @param {number} [props.notifCount]
 * @param {(() => void)} [props.onOpenMenu]
 * @param {(() => void)} [props.onOpenNotifs]
 */
export default function CalendarHeader({
  year,
  month,
  yearOptions,
  onChangeMonth,
  notifCount = 0,
  onOpenMenu,
  onOpenNotifs,
}) {
  return (
    <>
      {onOpenNotifs && (
        <button type="button" className="icon-btn top-notification-btn" title="알림" onClick={onOpenNotifs}>
          <svg viewBox="0 0 24 24">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          {notifCount > 0 && <span className="notification-count-badge">{notifCount > 99 ? '99+' : notifCount}</span>}
        </button>
      )}
      {onOpenMenu && (
        <div className="top-btn-group">
          <button type="button" className="icon-btn top-menu-btn" title="메뉴" onClick={onOpenMenu}>
            <svg viewBox="0 0 24 24">
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        </div>
      )}
      <div className="header">
        <div className="banner-container">
          <img src={BANNER} alt="운행 일지 로고" className="banner-logo" />
          <span className="banner-text">운행 일지</span>
        </div>

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
