import { useMemo, useState } from 'react'
import { getYearOptions, setYearMonth, shiftMonth } from '../lib/calendar.js'
import { getMonthlyFareRevenue, getOwnerMonthlyFinanceDetail } from '../lib/finance.js'
import { formatWon } from '../lib/money.js'
import { buildFinanceSettings, loadWorkDataByLogId } from '../lib/ownerFinance.js'
import '../main-calendar.css'

const YEAR_OPTIONS = getYearOptions()
const SCOPES = [
  { value: 'all', label: '전체 손익' },
  { value: 'owner', label: '차주' },
  { value: 'driver', label: '기사' },
]

function monthKeyOf(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

function won(amount) {
  return `${(Number(amount) || 0).toLocaleString('ko-KR')}원`
}

function dateLabel(date) {
  if (!date) return ''
  return `${date.slice(5).replace('-', '/')} `
}

function PageShell({ title, onBack, children }) {
  return (
    <div className="page revenue-page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">{title}</div>
        <div style={{ width: 40 }}></div>
      </div>
      {children}
    </div>
  )
}

function DateNav({ yearly, viewDate, year, month, onViewDate, onShift }) {
  return (
    <div className="date-navigator">
      <button type="button" className="arrow-btn" title={yearly ? '이전 해' : '이전 달'} onClick={() => onShift(-1)}>
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>
      <div className="date-select-group">
        <select className="date-select" value={year} onChange={(e) => onViewDate(setYearMonth(viewDate, Number(e.target.value), month))}>
          {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}년</option>)}
        </select>
        {!yearly && (
          <select className="date-select" value={month} onChange={(e) => onViewDate(setYearMonth(viewDate, year, Number(e.target.value)))}>
            {Array.from({ length: 12 }, (_, m) => <option key={m} value={m}>{m + 1}월</option>)}
          </select>
        )}
      </div>
      <button type="button" className="arrow-btn" title={yearly ? '다음 해' : '다음 달'} onClick={() => onShift(1)}>
        <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
    </div>
  )
}

function RevenueDetailRow({ label, amount, items, showDate }) {
  const [open, setOpen] = useState(false)
  const lines = Array.isArray(items) ? items : []

  return (
    <div className="revenue-detail-item">
      <button type="button" className={`revenue-detail-head${open ? ' expanded' : ''}`} onClick={() => setOpen((v) => !v)}>
        <span className="revenue-detail-chevron">
          <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </span>
        <span className="revenue-detail-label">{label}</span>
        <span className={`revenue-detail-amount${amount < 0 ? ' negative' : ''}`}>{won(amount)}</span>
      </button>
      {open && (
        <div className="revenue-detail-body">
          {lines.length === 0 && <div className="revenue-detail-empty">내역이 없습니다.</div>}
          {lines.map((item, index) => (
            <div key={`${item.label}-${item.date || index}`} className="revenue-detail-line">
              <span>{showDate ? dateLabel(item.date) : ''}{item.label}</span>
              <span>{won(item.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OwnerMonthlyCards({ detail }) {
  return (
    <>
      <div className="summary-card revenue-net-card">
        <div className="summary-row" style={{ marginBottom: 2 }}>
          <span className="summary-title" style={{ marginBottom: 0 }}>당월 순이익</span>
          <span
            className="summary-value"
            style={{
              fontSize: 'var(--fs-7)',
              fontWeight: 850,
              color: detail.netProfit < 0 ? 'var(--sunday-color)' : 'var(--primary-color)',
            }}
          >
            {won(detail.netProfit)}
          </span>
        </div>
        <div className="revenue-net-stats">총 {detail.tripCount}회 운행 / {detail.distanceKm.toLocaleString('ko-KR')}km / {detail.durationHours.toLocaleString('ko-KR')}시간</div>
        <div className="summary-row" style={{ marginTop: 14 }}>
          <span>당월 부가세(공급가액 기준 10%)</span>
          <span className="summary-value">{won(detail.vatAmount)}</span>
        </div>
        <RevenueDetailRow
          label={`미입금 운송료(${detail.unpaid.count}건)`}
          amount={detail.unpaid.total}
          items={detail.unpaid.items.map((item) => ({ label: item.client, amount: item.remainingAmount }))}
        />
      </div>

      <div className="summary-card revenue-net-card">
        <div className="summary-title">운송 수입</div>
        <RevenueDetailRow label="운송료" amount={detail.income.fare.total} items={detail.income.fare.items} />
        <RevenueDetailRow
          label="운임 수수료"
          amount={-detail.income.commission.total}
          items={detail.income.commission.items.map((item) => ({ label: item.label, amount: -item.amount }))}
        />
        <RevenueDetailRow
          label="당월 유가보조금 환급"
          amount={detail.income.fuelSubsidy.total}
          items={detail.income.fuelSubsidy.items}
          showDate
        />
        <div className="summary-row total">
          <span>합계</span>
          <span className="summary-value">{(Number(detail.income.total) || 0).toLocaleString('ko-KR')} 원</span>
        </div>
      </div>

      <div className="summary-card revenue-net-card">
        <div className="summary-title">운행 지출</div>
        <RevenueDetailRow
          label="정비"
          amount={-detail.expense.maint.total}
          items={detail.expense.maint.items.map((item) => ({ ...item, amount: -item.amount }))}
          showDate
        />
        <RevenueDetailRow
          label="주유비"
          amount={-detail.expense.fuel.total}
          items={detail.expense.fuel.items.map((item) => ({ ...item, amount: -item.amount }))}
          showDate
        />
        <RevenueDetailRow
          label="기타"
          amount={-detail.expense.misc.total}
          items={detail.expense.misc.items.map((item) => ({ ...item, amount: -item.amount }))}
          showDate
        />
        <div className="summary-row total revenue-expense-total">
          <span>합계</span>
          <span className="summary-value">-{(Number(detail.expense.total) || 0).toLocaleString('ko-KR')} 원</span>
        </div>
      </div>
    </>
  )
}

function OwnerRevenueView({ ownerKey }) {
  const [tab, setTab] = useState('monthly')
  const [scope, setScope] = useState('owner')
  const [viewDate, setViewDate] = useState(() => new Date())
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const yearly = tab === 'yearly'

  const settings = useMemo(() => buildFinanceSettings(ownerKey), [ownerKey])
  const workDataByLogId = useMemo(() => loadWorkDataByLogId(ownerKey), [ownerKey])

  const monthly = useMemo(
    () => getOwnerMonthlyFinanceDetail(monthKeyOf(year, month), scope, settings, workDataByLogId),
    [year, month, scope, settings, workDataByLogId],
  )

  const yearlyRows = useMemo(() => {
    const rows = []
    for (let m = 0; m < 12; m++) {
      const detail = getOwnerMonthlyFinanceDetail(monthKeyOf(year, m), scope, settings, workDataByLogId)
      rows.push({ month: m + 1, netProfit: detail.netProfit })
    }
    return rows
  }, [year, scope, settings, workDataByLogId])

  const yearNet = yearlyRows.reduce((sum, row) => sum + row.netProfit, 0)

  function shift(delta) {
    setViewDate((date) => (yearly ? new Date(date.getFullYear() + delta, date.getMonth(), 1) : shiftMonth(date, delta)))
  }

  return (
    <>
      <div className="revenue-top-card">
        <div className="maint-fuel-nav">
          <DateNav yearly={yearly} viewDate={viewDate} year={year} month={month} onViewDate={setViewDate} onShift={shift} />
        </div>
        <div className="settings-segmented-control maint-fuel-tabs">
          <button type="button" className={`toggle-btn${yearly ? ' active-work' : ''}`} onClick={() => setTab('yearly')}>년 매출</button>
          <button type="button" className={`toggle-btn${!yearly ? ' active-work' : ''}`} onClick={() => setTab('monthly')}>월 매출</button>
        </div>
        <div className="revenue-scope-tabs">
          {SCOPES.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`revenue-scope-tab${scope === item.value ? ' active' : ''}`}
              onClick={() => setScope(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {!yearly && <OwnerMonthlyCards key={`${scope}-${year}-${month}`} detail={monthly} />}

      {yearly && (
        <>
          <div className="revenue-year-list">
            {yearlyRows.map((row) => (
              <div key={row.month} className="revenue-year-row">
                <span>{row.month}월</span>
                <span className={row.netProfit < 0 ? 'negative' : ''}>{won(row.netProfit)}</span>
              </div>
            ))}
          </div>
          <div className="revenue-year-total">
            <span>{year}년 순이익 합계</span>
            <strong className={yearNet < 0 ? 'negative' : ''}>{won(yearNet)}</strong>
          </div>
        </>
      )}
    </>
  )
}

function DriverRevenueView({ ownerKey }) {
  const [tab, setTab] = useState('monthly')
  const [viewDate, setViewDate] = useState(() => new Date())
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const yearly = tab === 'yearly'

  const settings = useMemo(() => buildFinanceSettings(ownerKey), [ownerKey])
  const workDataByLogId = useMemo(() => loadWorkDataByLogId(ownerKey), [ownerKey])

  const monthly = useMemo(
    () => getMonthlyFareRevenue(monthKeyOf(year, month), settings, workDataByLogId),
    [year, month, settings, workDataByLogId],
  )

  const yearlyRows = useMemo(() => {
    const rows = []
    for (let m = 0; m < 12; m++) {
      const result = getMonthlyFareRevenue(monthKeyOf(year, m), settings, workDataByLogId)
      rows.push({ month: m + 1, ...result })
    }
    return rows
  }, [year, settings, workDataByLogId])

  const yearTotal = yearlyRows.reduce((sum, row) => sum + row.totalFare, 0)
  const showVehicles = monthly.byVehicle.length > 1

  function shift(delta) {
    setViewDate((date) => (yearly ? new Date(date.getFullYear() + delta, date.getMonth(), 1) : shiftMonth(date, delta)))
  }

  return (
    <>
      <div className="settings-segmented-control maint-fuel-tabs">
        <button type="button" className={`toggle-btn${!yearly ? ' active-work' : ''}`} onClick={() => setTab('monthly')}>월매출</button>
        <button type="button" className={`toggle-btn${yearly ? ' active-work' : ''}`} onClick={() => setTab('yearly')}>년매출</button>
      </div>

      <div className="maint-fuel-nav">
        <DateNav yearly={yearly} viewDate={viewDate} year={year} month={month} onViewDate={setViewDate} onShift={shift} />
      </div>

      {!yearly && (
        <>
          <div className="revenue-summary-card">
            <div className="revenue-summary-label">{year}년 {month + 1}월 총 운송료</div>
            <div className="revenue-summary-amount">{formatWon(monthly.totalFare)}</div>
            <div className="revenue-summary-sub">총 {monthly.tripCount}회 운행</div>
          </div>
          {showVehicles && (
            <div className="revenue-vehicle-list">
              {monthly.byVehicle.map((vehicle) => (
                <div key={vehicle.logId} className="revenue-vehicle-row">
                  <div>
                    <strong>{vehicle.label}</strong>
                    <div className="revenue-vehicle-meta">{vehicle.tripCount}회 운행</div>
                  </div>
                  <strong>{formatWon(vehicle.fare)}</strong>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {yearly && (
        <>
          <div className="revenue-summary-card">
            <div className="revenue-summary-label">{year}년 총 운송료</div>
            <div className="revenue-summary-amount">{formatWon(yearTotal)}</div>
          </div>
          <div className="revenue-year-list">
            {yearlyRows.map((row) => (
              <div key={row.month} className="revenue-year-row">
                <span>{row.month}월</span>
                <strong>{formatWon(row.totalFare)}</strong>
              </div>
            ))}
            <div className="revenue-year-row total">
              <span>합계</span>
              <strong>{formatWon(yearTotal)}</strong>
            </div>
          </div>
        </>
      )}
    </>
  )
}

export default function RevenuePage({ ownerKey = 'guest', session, onBack }) {
  const isDriver = session?.accountType === 'employed_driver'

  return (
    <PageShell title="매출" onBack={onBack}>
      {isDriver ? <DriverRevenueView ownerKey={ownerKey} /> : <OwnerRevenueView ownerKey={ownerKey} />}
    </PageShell>
  )
}
