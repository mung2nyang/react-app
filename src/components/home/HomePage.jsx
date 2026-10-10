// @ts-check
// 새 홈 1단계: 위쪽 줄(알림·로고·메뉴) + "오늘" 카드. 달력은 하단 "운행" 탭(/app/calendar)으로 옮김.
import { resolveLogSettings } from '../../domain/carSettingsScope.js'
import { dayWorkBadgeLabel } from '../../domain/calendarBadges.js'
import { todayWorkLogSelection } from '../../domain/calendar.js'
import { resolveFixedUnitPrice } from '../../domain/clients.js'
import { isOffDay } from '../../domain/day-record.js'
import { assetPath } from '../../lib/assetPath.js'
import { useOwnerCars, useOwnerClients, useOwnerSettings, useOwnerWorkData } from '../../store/ownerDataHooks.js'
import '../calendar/calendar-header.css'
import './home.css'

const BANNER = assetPath('/images/banner_image.png')
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/**
 * @param {Object} props
 * @param {string} props.ownerKey
 * @param {import('../../lib/outboxTypes.js').AppSession|null} [props.session]
 * @param {number} [props.notifCount]
 * @param {(() => void)} [props.onOpenMenu]
 * @param {(() => void)} [props.onOpenNotifs]
 * @param {(dateKey: string) => void} props.onOpenToday
 */
export default function HomePage({ ownerKey, session, notifCount = 0, onOpenMenu, onOpenNotifs, onOpenToday }) {
  const workData = useOwnerWorkData(ownerKey)
  const settings = useOwnerSettings(ownerKey)
  const clients = useOwnerClients(ownerKey)
  const cars = useOwnerCars(ownerKey)
  // 달력 칸 글자와 같은 값 — MainPageRoute·CalendarPage와 같은 규칙으로 단가·입력 방식을 고름.
  const clientScopeKey = session?.linkedOwnerId ? (cars[0]?.number || 'main') : 'main'
  const unitPrice = resolveFixedUnitPrice({ clients }, clientScopeKey)
  const inputMode = resolveLogSettings(settings, 'main').inputMode === 'fare' ? 'fare' : 'count'

  const now = new Date()
  const today = todayWorkLogSelection(now)
  const record = workData[today.dateKey]
  const off = isOffDay(record)
  const label = dayWorkBadgeLabel(record, { inputMode, unitPrice })
  const weekday = WEEKDAYS[now.getDay()]
  const status = off ? '오늘은 휴무입니다' : label ? `오늘 ${label}` : '아직 기록이 없습니다'

  return (
    <div className="page home-page">
      <div className="settings-header home-topbar">
        <div className="home-brand">
          <img src={BANNER} alt="" className="home-brand-logo" />
          <span className="home-brand-text">운행일지</span>
        </div>
        <div className="home-topbar-actions">
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
            <button type="button" className="icon-btn top-menu-btn" title="메뉴" onClick={onOpenMenu}>
              <svg viewBox="0 0 24 24">
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
      </div>

      <section className="home-today-card" aria-label="오늘 운행">
        <p className="home-today-date">{today.month}월 {today.day}일 ({weekday})</p>
        <p className="home-today-status">{status}</p>
        <button type="button" className="home-today-btn" onClick={() => onOpenToday(today.dateKey)}>
          {off ? '일지 열기' : label ? '하나 더 기록' : '운행 기록하기'}
        </button>
      </section>
    </div>
  )
}
