// @ts-check
// Step 5(달력 홈 재작성): MainPage.jsx의 상단 알림/메뉴 버튼 + 배너 + 년/월 네비게이션을
// 옮긴다. 표시(연/월)만 다루고 그 값을 어디서 왔는지(URL 쿼리)는 모른다 — CalendarPage가
// year/month/onChangeMonth로 넘겨준다.
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
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
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
            <select
              className="date-select"
              title="년도 선택"
              value={year}
              onChange={(e) => onChangeMonth(Number(e.target.value), month)}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
            <select
              className="date-select"
              title="월 선택"
              value={month}
              onChange={(e) => onChangeMonth(year, Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, m) => (
                <option key={m} value={m}>{m + 1}월</option>
              ))}
            </select>
          </div>

          <button type="button" className="arrow-btn" title="다음 달" onClick={() => onChangeMonth(year, month + 1)}>
            <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      </div>
    </>
  )
}
