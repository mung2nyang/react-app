import { useMemo, useState } from 'react'
import { buildCalendarCells, getYearOptions, setYearMonth, shiftMonth } from '../lib/calendar.js'
import { dayTripCount, getCallDetails, getFixedCount, isOffDay, loadWorkData, monthCallUnpaidTotal, monthWorkFareSummary, saveDayRecord, saveWorkData } from '../lib/workData.js'
import { formatCurrencyInput, formatWon, parseCurrencyValue } from '../lib/money.js'
import { loadPracticeSettings, savePracticeSettings } from '../lib/practiceSettings.js'
import { loadClients } from '../lib/clients.js'
import WorkLogPage from './WorkLogPage.jsx'
import '../main-calendar.css'

const BANNER = '/images/banner_image.png'
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const YEAR_OPTIONS = getYearOptions()

export default function MainPage({ userName, ownerKey = 'guest', onBackToAuth, onOpenMenu, onOpenNotifs, notifCount = 0, onWorkChanged, showToast, selected = null, onSelectDay, onCloseWorkLog }) {
  const [viewDate, setViewDate] = useState(() => new Date())
  const [workData, setWorkData] = useState(() => loadWorkData(ownerKey))
  const [settings, setSettings] = useState(() => loadPracticeSettings(ownerKey))

  const cells = useMemo(() => buildCalendarCells(viewDate), [viewDate])
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const unitPrice = settings.unitPrice
  const fareSummary = useMemo(() => monthWorkFareSummary(workData, year, month, unitPrice), [workData, year, month, unitPrice])
  const unpaidTotal = useMemo(() => monthCallUnpaidTotal(workData, year, month), [workData, year, month])

  function saveUnitPrice(nextPrice) {
    const n = parseCurrencyValue(nextPrice)
    setSettings(savePracticeSettings(ownerKey, { unitPrice: n }))
  }

  function saveDay(dateKey, patch) {
    const current = workData[dateKey] || {}
    const next = saveDayRecord(workData, dateKey, {
      isOff: patch.isOff ?? isOffDay(current),
      fixedCount: patch.fixedCount ?? getFixedCount(current),
      callDetails: patch.callDetails ?? getCallDetails(current),
      fixedRouteCounts: patch.fixedRouteCounts,
    })
    setWorkData(next)
    saveWorkData(ownerKey, next)
    onWorkChanged?.()
  }

  if (selected) {
    const record = workData[selected.dateKey]
    return (
      <WorkLogPage
        month={selected.month}
        day={selected.day}
        dateKey={selected.dateKey}
        count={getFixedCount(record)}
        isOff={isOffDay(record)}
        record={record}
        clients={loadClients(ownerKey)}
        ownerKey={ownerKey}
        settings={settings}
        showToast={showToast}
        onCountChange={(count) => saveDay(selected.dateKey, { isOff: false, fixedCount: count })}
        onOffChange={(off) => saveDay(selected.dateKey, { isOff: off, fixedCount: off ? 0 : getFixedCount(record) })}
        onCallDetailsChange={(callDetails) => saveDay(selected.dateKey, { callDetails })}
        onRouteCountsChange={(fixedRouteCounts, fixedCount) => saveDay(selected.dateKey, { isOff: false, fixedCount, fixedRouteCounts })}
        onClose={() => onCloseWorkLog?.()}
      />
    )
  }

  return (
    <div className="page main-page">
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
          <button type="button" className="arrow-btn" title="이전 달" onClick={() => setViewDate((d) => shiftMonth(d, -1))}>
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>

          <div className="date-select-group">
            <select
              className="date-select"
              title="년도 선택"
              value={year}
              onChange={(e) => setViewDate(setYearMonth(viewDate, Number(e.target.value), month))}
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
            <select
              className="date-select"
              title="월 선택"
              value={month}
              onChange={(e) => setViewDate(setYearMonth(viewDate, year, Number(e.target.value)))}
            >
              {Array.from({ length: 12 }, (_, m) => (
                <option key={m} value={m}>{m + 1}월</option>
              ))}
            </select>
          </div>

          <button type="button" className="arrow-btn" title="다음 달" onClick={() => setViewDate((d) => shiftMonth(d, 1))}>
            <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      </div>

      <div className="calendar-grid">
        {WEEKDAYS.map((label, index) => (
          <div
            key={label}
            className={`day-header${index === 0 ? ' sunday' : ''}${index === 6 ? ' saturday' : ''}`}
          >
            {label}
          </div>
        ))}
        {cells.map((cell) => {
          const record = cell.empty ? null : workData[cell.key]
          const trips = dayTripCount(record)
          const off = isOffDay(record)
          return (
            <button
              key={cell.key}
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
                onSelectDay?.({ dateKey: cell.key, month: month + 1, day: cell.day })
              }}
            >
              {!cell.empty && <span className="cell-date-text">{cell.day}</span>}
              {off && <span className="off-badge">휴무</span>}
              {!off && trips > 0 && <span className="work-badge">{trips}회</span>}
            </button>
          )
        })}
      </div>

      {settings.paymentOn && unpaidTotal > 0 && (
        <div className="unpaid-summary-card">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          이번 달 총 {unpaidTotal.toLocaleString()}원의 미수금이 있습니다.
        </div>
      )}

      <div className="summary-card">
        <div className="summary-title">
          <span>월간 운송료 정산</span>
          <span>횟수 {fareSummary.trips}회 · 세부 입력 {fareSummary.callTrips}건</span>
        </div>
        <div className="summary-row">
          <span>1회 단가</span>
          <input
            className="summary-price-input"
            inputMode="numeric"
            placeholder="0"
            value={formatCurrencyInput(unitPrice)}
            onChange={(e) => saveUnitPrice(e.target.value)}
            aria-label="1회 단가"
          />
        </div>
        <div className="summary-row">
          <span>기본 운송료 (횟수×단가)</span>
          <span className="summary-value">{formatWon(fareSummary.fixedFare)}</span>
        </div>
        <div className="summary-row">
          <span>세부 입력 운임</span>
          <span className="summary-value">{formatWon(fareSummary.callFare)}</span>
        </div>
        <div className="summary-row">
          <span>공급가액</span>
          <span className="summary-value">{formatWon(fareSummary.fare)}</span>
        </div>
        <div className="summary-row">
          <span>부가세 (공급가액 기준 10%)</span>
          <span className="summary-value">{formatWon(fareSummary.vat)}</span>
        </div>
        <div className="summary-row total">
          <span>합계</span>
          <span className="summary-value">{formatWon(fareSummary.total)}</span>
        </div>
        <p className="summary-hint">횟수×단가에 세부 입력 운임을 더합니다. 면제 건은 부가세 0원입니다.</p>
      </div>

      {userName && <p className="main-practice-note">{userName}님 · 달력에 횟수 기록</p>}
      {onBackToAuth && (
        <button type="button" className="main-practice-back" onClick={onBackToAuth}>
          처음으로 돌아가기
        </button>
      )}
    </div>
  )
}
