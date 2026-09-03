// @ts-check
// 재감사 2차(FAIL 지적) — RevenuePage.jsx 분할 조각: 차주(오너) 손익 화면.
import { useMemo, useState } from 'react'
import { shiftMonth } from '../../lib/calendar.js'
import { getOwnerMonthlyFinanceDetail } from '../../lib/finance.js'
import { buildFinanceSettings } from '../../lib/ownerFinance.js'
import { useOwnerCars, useOwnerDrivers, useOwnerExpenses, useOwnerProfile, useOwnerSettings, useOwnerWorkDataByLogId } from '../../store/ownerDataHooks.js'
import { DateNav } from './RevenueNav.jsx'
import OwnerMonthlyCards from './OwnerMonthlyCards.jsx'
import { monthKeyOf, won } from './revenueFormat.js'

const SCOPES = [
  { value: 'all', label: '전체 손익' },
  { value: 'owner', label: '차주' },
  { value: 'driver', label: '기사' },
]

/** @param {{ ownerKey: string }} props */
export default function OwnerRevenueView({ ownerKey }) {
  const [tab, setTab] = useState('monthly')
  const [scope, setScope] = useState('owner')
  const [viewDate, setViewDate] = useState(() => new Date())
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const yearly = tab === 'yearly'

  const cars = useOwnerCars(ownerKey)
  const practiceSettings = useOwnerSettings(ownerKey)
  const profile = useOwnerProfile(ownerKey)
  const drivers = useOwnerDrivers(ownerKey)
  const settings = useMemo(() => {
    void cars
    void practiceSettings
    void profile
    void drivers
    return buildFinanceSettings(ownerKey)
  }, [ownerKey, cars, practiceSettings, profile, drivers])
  const workDataByLogId = useOwnerWorkDataByLogId(ownerKey)
  const expenses = useOwnerExpenses(ownerKey)

  const monthly = useMemo(
    () => getOwnerMonthlyFinanceDetail(monthKeyOf(year, month), scope, settings, workDataByLogId, expenses),
    [year, month, scope, settings, workDataByLogId, expenses],
  )

  const yearlyRows = useMemo(() => {
    const rows = []
    for (let m = 0; m < 12; m++) {
      const detail = getOwnerMonthlyFinanceDetail(monthKeyOf(year, m), scope, settings, workDataByLogId, expenses)
      rows.push({ month: m + 1, netProfit: detail.netProfit })
    }
    return rows
  }, [year, scope, settings, workDataByLogId, expenses])

  const yearNet = yearlyRows.reduce((sum, row) => sum + row.netProfit, 0)

  /** @param {number} delta */
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

      {!yearly && <OwnerMonthlyCards key={`${scope}-${year}-${month}`} detail={monthly} scope={scope} />}

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
