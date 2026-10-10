// @ts-check
// 새 홈: 위쪽 줄(작은 로고·알림·메뉴) + 오늘 카드 + 할 일 카드 + 이번 달 정산 합계. 달력은 하단 "운행" 탭(/app/calendar).
import { resolveLogSettings } from '../../domain/carSettingsScope.js'
import { todayWorkLogSelection } from '../../domain/calendar.js'
import { isOffDay } from '../../domain/day-record.js'
import { useOwnerCars } from '../../store/ownerDataHooks.js'
import useMonthSettlement from '../calendar/useMonthSettlement.js'
import AppTopBar from '../shared/AppTopBar.jsx'
import { useReceivablesData } from '../receivables/useReceivablesData.js'
import HomeAssistantBar from './HomeAssistantBar.jsx'
import HomeMonthCard from './HomeMonthCard.jsx'
import HomeTodayCard from './HomeTodayCard.jsx'
import HomeTodoCard from './HomeTodoCard.jsx'
import useTodayInspectionMissing from './useTodayInspectionMissing.js'
import './home.css'

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
      <AppTopBar notifCount={notifCount} onOpenNotifs={onOpenNotifs} onOpenMenu={onOpenMenu} />

      <HomeTodayCard
        record={record}
        today={today}
        weekday={now.getDay()}
        inputMode={inputMode}
        unitPrice={unitPrice}
        onOpenToday={onOpenToday}
      />
      <HomeAssistantBar />
      <HomeTodoCard
        inspectionMissing={inspectionMissing}
        unpaidCount={unpaidItems.length}
        unpaidTotal={unpaidTotal}
        onOpenInspection={() => onOpenToday(today.dateKey)}
        onOpenReceivables={onOpenReceivables}
      />
      <HomeMonthCard total={summary.total} expenseTotal={summary.maint + summary.fuel + summary.misc} onOpenCalendar={onOpenCalendar} />
    </div>
  )
}
