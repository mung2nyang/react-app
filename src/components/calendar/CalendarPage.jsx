// @ts-check
// 달력 화면. 표시 월은 URL `?y=&m=` 쿼리(calendarViewDate.js)라 새로고침해도 남고, workData·settings는 store를 구독한다.
// logId가 있으면 서브 차량 달력(workData·paymentOn·수수료 게이트).
import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { buildCalendarCells, getYearOptions } from '../../domain/calendar.js'
import { searchParamsForViewDate, viewDateFromSearchParams } from '../../domain/calendarViewDate.js'
import { monthCallUnpaidTotal } from '../../domain/day-record.js'
import CalendarHeader from './CalendarHeader.jsx'
import CalendarGrid from './CalendarGrid.jsx'
import CalendarMonthSummary from './CalendarMonthSummary.jsx'
import CalendarSubLogBanner from './CalendarSubLogBanner.jsx'
import useMonthSettlement from './useMonthSettlement.js'
import './calendar.css'

const YEAR_OPTIONS = getYearOptions()

/**
 * @param {Object} props
 * @param {string} props.ownerKey
 * @param {string} [props.logId]
 * @param {string} [props.clientScopeKey] 고정노선 거래처 스코프(연동기사 본인은 배정 차량번호). 없으면 logId.
 * @param {string} [props.userName]
 * @param {(() => void)} [props.onOpenMenu]
 * @param {(() => void)} [props.onBackToAuth]
 * @param {(message: string) => void} [props.showToast]
 * @param {(sel: { dateKey: string, month: number, day: number }) => void} props.onSelectDay
 */
export default function CalendarPage({
  ownerKey, logId = 'main', clientScopeKey, userName: _userName, onOpenMenu, onBackToAuth: _onBackToAuth, showToast: _showToast, onSelectDay,
}) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const viewDate = useMemo(() => viewDateFromSearchParams(searchParams), [searchParams])
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const isMain = logId === 'main'

  const { workData, settings, inputMode, unitPrice, expenses, summary } = useMonthSettlement({
    ownerKey, logId, clientScopeKey, year, month,
  })
  const paymentOn = isMain ? !!settings.paymentOn : !!settings.subPaymentOn
  // 서브차량 실거리: subDistanceOn 설정이 없어 메인만.
  const distanceOn = isMain && !!settings.distanceOn

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
        onOpenMenu={onOpenMenu}
      />

      {!isMain && (
        <CalendarSubLogBanner logId={logId} onBackToMain={() => navigate('/app/calendar')} />
      )}

      <CalendarGrid
        cells={cells}
        month={month + 1}
        workData={workData}
        inputMode={inputMode}
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
    </div>
  )
}
