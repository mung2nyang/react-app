// @ts-check
// 새 홈: 위쪽 줄(작은 로고·알림·메뉴) + 오늘 카드 + 할 일 카드 + 이번 달 정산 합계. 달력은 하단 "달력" 탭(/app/calendar).
import { resolveLogSettings } from '../../../domain/carSettingsScope.ts'
import { todayWorkLogSelection } from '../../../domain/calendar.ts'
import { isOffDay } from '../../../domain/day-record.ts'
import { useOwnerCars } from '../../../data/store/ownerDataHooks.ts'
import useMonthSettlement from '../../../data/store/useMonthSettlement.ts'
import AppTopBar from '../../../shared/ui/AppTopBar.jsx'
import { useReceivablesData } from '../../receivables/hooks/useReceivablesData.js'
import HomeAssistantBar from './HomeAssistantBar.jsx'
import HomeMonthCard from './HomeMonthCard.jsx'
import HomeTodayCard from './HomeTodayCard.jsx'
import HomeTodoCard from './HomeTodoCard.jsx'
import useTodayInspectionMissing from '../hooks/useTodayInspectionMissing.js'
import './home.css'
import { useSession } from '../../../data/cloud/sessionContext.ts'

/**
 * 미수금 화면처럼 기사 차량이 있으면 차량별(메인 먼저) 한 줄씩, 없으면 한 줄.
 * @param {Array<{ logId: string, logLabel: string, remainingAmount: number }>} items
 * @param {boolean} byCar
 * @returns {Array<import('./HomeTodoCard.jsx').UnpaidRow>}
 */
function unpaidRowsByCar(items, byCar) {
  /** @type {Map<string, import('./HomeTodoCard.jsx').UnpaidRow>} */
  const rows = new Map()
  items.forEach((item) => {
    const key = byCar ? item.logId : 'all'
    const row = rows.get(key) || { key, label: byCar ? item.logLabel : '', main: item.logId === 'main', count: 0, total: 0 }
    row.count += 1
    row.total += item.remainingAmount
    rows.set(key, row)
  })
  return [...rows.values()]
}

/**
 * @param {Object} props
 * @param {number} [props.notifCount]
 * @param {(() => void)} [props.onOpenMenu]
 * @param {(() => void)} [props.onOpenNotifs]
 * @param {(dateKey: string) => void} props.onOpenToday
 * @param {() => void} props.onOpenReceivables
 * @param {() => void} props.onOpenCalendar
 */
export default function HomePage({
  notifCount = 0, onOpenMenu, onOpenNotifs, onOpenToday, onOpenReceivables, onOpenCalendar,
}) {
  const { ownerKey, session } = useSession()
  const cars = useOwnerCars(ownerKey)
  // 달력과 같은 규칙(MainPageRoute): 연동 기사 본인은 배정 차량 거래처 스코프.
  const clientScopeKey = session?.linkedOwnerId ? (cars[0]?.number || 'main') : 'main'
  const now = new Date()
  const today = todayWorkLogSelection(now)
  const { workData, settings, inputMode, unitPrice, palletPrice, summary } = useMonthSettlement({
    ownerKey, clientScopeKey, year: now.getFullYear(), month: now.getMonth(),
  })
  const record = workData[today.dateKey]
  const inspectionMissing = useTodayInspectionMissing({
    ownerKey, dateKey: today.dateKey, enabled: !!resolveLogSettings(settings, 'main').dailyInspectionOn, isOff: isOffDay(record),
  })
  const { items: unpaidItems, hasSubCars } = useReceivablesData(ownerKey, session?.accountType === 'employed_driver')

  return (
    <div className="page home-page">
      <AppTopBar notifCount={notifCount} onOpenNotifs={onOpenNotifs} onOpenMenu={onOpenMenu} />

      <HomeTodayCard
        record={record}
        today={today}
        weekday={now.getDay()}
        inputMode={inputMode}
        unitPrice={unitPrice}
        palletPrice={palletPrice}
        onOpenToday={onOpenToday}
      />
      <HomeAssistantBar />
      <HomeTodoCard
        inspectionMissing={inspectionMissing}
        unpaidRows={unpaidRowsByCar(unpaidItems, hasSubCars)}
        onOpenInspection={() => onOpenToday(today.dateKey)}
        onOpenReceivables={onOpenReceivables}
      />
      <HomeMonthCard total={summary.total} expenseTotal={summary.maint + summary.fuel + summary.misc} onOpenCalendar={onOpenCalendar} />
    </div>
  )
}
