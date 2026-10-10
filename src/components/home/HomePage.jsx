// @ts-check
// 새 홈: 위쪽 줄(작은 로고·알림·메뉴) + 오늘 카드 + 할 일 카드 + 이번 달 정산 합계. 달력은 하단 "운행" 탭(/app/calendar).
import { resolveLogSettings } from '../../domain/carSettingsScope.js'
import { todayWorkLogSelection } from '../../domain/calendar.js'
import { isOffDay } from '../../domain/day-record.js'
import { assetPath } from '../../lib/assetPath.js'
import { useOwnerCars } from '../../store/ownerDataHooks.js'
import useMonthSettlement from '../calendar/useMonthSettlement.js'
import { useReceivablesData } from '../receivables/useReceivablesData.js'
import HomeMonthCard from './HomeMonthCard.jsx'
import HomeTodayCard from './HomeTodayCard.jsx'
import HomeTodoCard from './HomeTodoCard.jsx'
import useTodayInspectionMissing from './useTodayInspectionMissing.js'
import '../calendar/calendar-header.css'
import './home.css'

const BANNER = assetPath('/images/banner_image.png')

/**
 * @param {Object} props
 * @param {string} props.ownerKey
 * @param {import('../../lib/outboxTypes.js').AppSession|null} [props.session]
 * @param {number} [props.notifCount]
 * @param {(() => void)} [props.onOpenMenu]
 * @param {(() => void)} [props.onOpenNotifs]
 * @param {(dateKey: string) => void} props.onOpenToday
 * @param {() => void} props.onOpenReceivables
 * @param {() => void} props.onOpenCalendar
 */
export default function HomePage({
  ownerKey, session, notifCount = 0, onOpenMenu, onOpenNotifs, onOpenToday, onOpenReceivables, onOpenCalendar,
}) {
  const cars = useOwnerCars(ownerKey)
  // 달력과 같은 규칙(MainPageRoute): 연동 기사 본인은 배정 차량 거래처 스코프.
  const clientScopeKey = session?.linkedOwnerId ? (cars[0]?.number || 'main') : 'main'
  const now = new Date()
  const today = todayWorkLogSelection(now)
  const { workData, settings, inputMode, unitPrice, summary } = useMonthSettlement({
    ownerKey, clientScopeKey, year: now.getFullYear(), month: now.getMonth(),
  })
  const record = workData[today.dateKey]
  const inspectionMissing = useTodayInspectionMissing({
    ownerKey, dateKey: today.dateKey, enabled: !!resolveLogSettings(settings, 'main').dailyInspectionOn, isOff: isOffDay(record),
  })
  const { items: unpaidItems } = useReceivablesData(ownerKey)
  const unpaidTotal = unpaidItems.reduce((sum, item) => sum + item.remainingAmount, 0)

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

      <HomeTodayCard
        record={record}
        today={today}
        weekday={now.getDay()}
        inputMode={inputMode}
        unitPrice={unitPrice}
        onOpenToday={onOpenToday}
      />
      <HomeTodoCard
        inspectionMissing={inspectionMissing}
        unpaidCount={unpaidItems.length}
        unpaidTotal={unpaidTotal}
        onOpenInspection={() => onOpenToday(today.dateKey)}
        onOpenReceivables={onOpenReceivables}
      />
      <HomeMonthCard total={summary.total} onOpenCalendar={onOpenCalendar} />
    </div>
  )
}
