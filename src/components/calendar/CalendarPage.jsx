// @ts-check
// Step 5(달력 홈 재작성): MainPage.jsx를 대체하는 새 달력 홈. 달력 표시월은 URL의
// `?y=&m=` 쿼리에 둬서 새로고침에도 그대로 남는다(domain/calendarViewDate.js — 완료
// 조건 "새로고침 후 같은 달"). workData/settings는 컴포넌트가 직접 loadX()로 뜬
// 스냅샷이 아니라 store를 구독해서 받는다(재감사 4번: store/ownerDataHooks.js —
// MainPageRoute의 WorkLogPage 입력도 같은 훅을 쓴다, 단일 진실 공급원) —
// migration-plan.md 1.3이 금지한 "화면이 자기만의 스냅샷을 갖는" 패턴을 이 화면에서
// 처음 깬다(migration-audit-plan.md "Step 5의 정확한 시작점").
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { buildCalendarCells, getYearOptions } from '../../domain/calendar.js'
import { searchParamsForViewDate, viewDateFromSearchParams } from '../../domain/calendarViewDate.js'
import { resolveFixedUnitPrice } from '../../domain/clients.js'
import { monthCallUnpaidTotal, monthWorkFareSummary } from '../../domain/day-record.js'
import { useOwnerClients, useOwnerSettings, useOwnerWorkData } from '../../store/ownerDataHooks.js'
import CalendarHeader from './CalendarHeader.jsx'
import CalendarGrid from './CalendarGrid.jsx'
import CalendarMonthSummary from './CalendarMonthSummary.jsx'
import '../../main-calendar.css'
// calendar.css는 main-calendar.css "다음"에 와야 한다 — 그 안의 .date-cell을
// position:relative로 보강하는 캐스케이드 오버라이드다(재감사 6번, calendar.css 주석 참고).
import './calendar.css'

/** @typedef {import('./CalendarMonthSummary.jsx').FareSummary} FareSummary */

const YEAR_OPTIONS = getYearOptions()

/**
 * @param {Object} props
 * @param {string} props.ownerKey
 * @param {string} [props.userName]
 * @param {number} [props.notifCount]
 * @param {(() => void)} [props.onOpenMenu]
 * @param {(() => void)} [props.onOpenNotifs]
 * @param {(() => void)} [props.onBackToAuth]
 * @param {(message: string) => void} [props.showToast]
 * @param {(sel: { dateKey: string, month: number, day: number }) => void} props.onSelectDay
 */
export default function CalendarPage({ ownerKey, userName, notifCount, onOpenMenu, onOpenNotifs, onBackToAuth, onSelectDay }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const viewDate = useMemo(() => viewDateFromSearchParams(searchParams), [searchParams])
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const workData = useOwnerWorkData(ownerKey)
  const settings = useOwnerSettings(ownerKey)
  const clients = useOwnerClients(ownerKey)
  const unitPrice = resolveFixedUnitPrice({ clients })

  const cells = useMemo(() => buildCalendarCells(viewDate), [viewDate])
  const fareSummary = /** @type {FareSummary} */ (useMemo(
    () => monthWorkFareSummary(workData, year, month, unitPrice),
    [workData, year, month, unitPrice],
  ))
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

      <CalendarGrid
        cells={cells}
        month={month + 1}
        workData={workData}
        inputMode={settings.inputMode === 'fare' ? 'fare' : 'count'}
        unitPrice={unitPrice}
        paymentOn={settings.paymentOn}
        onSelectDay={onSelectDay}
      />

      <CalendarMonthSummary
        paymentOn={settings.paymentOn}
        unpaidTotal={unpaidTotal}
        fareSummary={fareSummary}
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
