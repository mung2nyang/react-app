// @ts-check
// Step 5(달력 홈 재작성): MainPage.jsx를 대체하는 새 달력 홈. 달력 표시월은 URL의
// `?y=&m=` 쿼리에 둬서 새로고침에도 그대로 남는다(domain/calendarViewDate.js — 완료
// 조건 "새로고침 후 같은 달"). workData/settings는 컴포넌트가 직접 loadX()로 뜬
// 스냅샷이 아니라 store를 구독해서 받는다(재감사 4번: store/ownerDataHooks.js —
// MainPageRoute의 WorkLogPage 입력도 같은 훅을 쓴다, 단일 진실 공급원) —
// migration-plan.md 1.3이 금지한 "화면이 자기만의 스냅샷을 갖는" 패턴을 이 화면에서
// 처음 깬다(migration-audit-plan.md "Step 5의 정확한 시작점").
// Step 9 슬라이스 B: logId prop — 서브 차량 달력(workData·paymentOn·수수료 게이트).
// 이관 계획 ③-2: 월간 정산 카드를 monthSettlementSummary로 연결.
import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { buildCalendarCells, getYearOptions } from '../../domain/calendar.js'
import { searchParamsForViewDate, viewDateFromSearchParams } from '../../domain/calendarViewDate.js'
import { getFixedRouteClient, resolveFixedUnitPrice } from '../../domain/clients.js'
import { monthCallUnpaidTotal } from '../../domain/day-record.js'
import { monthSettlementSummary } from '../../domain/monthSettlement.js'
import {
  useOwnerCars, useOwnerClients, useOwnerExpenses,
  useOwnerSettings, useOwnerWorkData, useOwnerWorkDataByLogId,
} from '../../store/ownerDataHooks.js'
import CalendarHeader from './CalendarHeader.jsx'
import CalendarGrid from './CalendarGrid.jsx'
import CalendarMonthSummary from './CalendarMonthSummary.jsx'
import CalendarSubLogBanner from './CalendarSubLogBanner.jsx'
import '../../main-calendar.css'
import './calendar.css'

const YEAR_OPTIONS = getYearOptions()
const EMPTY_WORK = /** @type {Record<string, import('../../domain/dayRecordTypes.js').DayRecordLike>} */ ({})

/**
 * @param {Object} props
 * @param {string} props.ownerKey
 * @param {string} [props.logId]
 * @param {string} [props.userName]
 * @param {number} [props.notifCount]
 * @param {(() => void)} [props.onOpenMenu]
 * @param {(() => void)} [props.onOpenNotifs]
 * @param {(() => void)} [props.onBackToAuth]
 * @param {(message: string) => void} [props.showToast]
 * @param {(sel: { dateKey: string, month: number, day: number }) => void} props.onSelectDay
 */
export default function CalendarPage({
  ownerKey, logId = 'main', userName, notifCount, onOpenMenu, onOpenNotifs, onBackToAuth, showToast: _showToast, onSelectDay,
}) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const viewDate = useMemo(() => viewDateFromSearchParams(searchParams), [searchParams])
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const isMain = logId === 'main'

  const mainWorkData = useOwnerWorkData(ownerKey)
  const workDataByLogId = useOwnerWorkDataByLogId(ownerKey)
  const workData = isMain ? mainWorkData : (workDataByLogId[logId] || EMPTY_WORK)
  const settings = useOwnerSettings(ownerKey)
  const clients = useOwnerClients(ownerKey)
  const paymentOn = isMain ? !!settings.paymentOn : !!settings.subPaymentOn
  const unitPrice = resolveFixedUnitPrice({ clients })
  const cars = useOwnerCars(ownerKey)
  const expenses = useOwnerExpenses(ownerKey)

  const fixedRouteClient = getFixedRouteClient({ clients })
  const activeFixedOn = isMain ? !!settings.fixedOn : !!settings.subFixedOn
  const car = isMain ? null : (cars || []).find((c) => c.number === logId) || null
  // 서브차량 실거리: react-app에 subDistanceOn 설정이 없어 이번 슬라이스는 메인만.
  const distanceOn = isMain && !!settings.distanceOn

  const summary = useMemo(
    () => monthSettlementSummary(workData, year, month, {
      logId, unitPrice, fixedRouteClient, activeFixedOn, clients, car, expenses,
    }),
    [workData, year, month, logId, unitPrice, fixedRouteClient, activeFixedOn, clients, car, expenses],
  )
  const cells = useMemo(() => buildCalendarCells(viewDate), [viewDate])
  const unpaidTotal = useMemo(() => monthCallUnpaidTotal(workData, year, month), [workData, year, month])

  /** @param {number} nextYear @param {number} nextMonth */
  function changeMonth(nextYear, nextMonth) {
    setSearchParams(searchParamsForViewDate(new Date(nextYear, nextMonth, 1)), { replace: true })
  }

  return (
    <div className="page main-page">
      <CalendarHeader
        year={year}
        month={month}
        yearOptions={YEAR_OPTIONS}
        onChangeMonth={changeMonth}
        notifCount={notifCount}
        onOpenMenu={onOpenMenu}
        onOpenNotifs={onOpenNotifs}
      />

      {!isMain && (
        <CalendarSubLogBanner logId={logId} onBackToMain={() => navigate('/app')} />
      )}

      <CalendarGrid
        cells={cells}
        month={month + 1}
        workData={workData}
        inputMode={settings.inputMode === 'fare' ? 'fare' : 'count'}
        unitPrice={unitPrice}
        paymentOn={paymentOn}
        expenses={expenses}
        expenseVehicle={isMain ? undefined : logId}
        onSelectDay={onSelectDay}
      />

      <CalendarMonthSummary
        paymentOn={paymentOn}
        unpaidTotal={unpaidTotal}
        summary={summary}
        distanceOn={distanceOn}
      />

      {userName && <p className="main-practice-note">{userName}님 · 달력에 횟수 기록</p>}
      {onBackToAuth && (
        <button type="button" className="main-practice-back" onClick={onBackToAuth}>
          처음으로 돌아가기
        </button>
      )}
    </div>
  )
}
