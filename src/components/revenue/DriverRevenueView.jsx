// @ts-check
// 재감사 2차(FAIL 지적) — RevenuePage.jsx 분할 조각: 고용 기사 손익 화면(운송료만,
// 정비/주유 등 비용 개념 없음 — 원본 그대로).
import { useMemo, useState } from 'react'
import { shiftMonth } from '../../lib/calendar.js'
import { getMonthlyFareRevenue } from '../../lib/finance.js'
import { formatWon } from '../../lib/money.js'
import { buildFinanceSettings } from '../../lib/ownerFinance.js'
import { useOwnerCars, useOwnerDrivers, useOwnerProfile, useOwnerSettings, useOwnerWorkDataByLogId } from '../../store/ownerDataHooks.js'
import { DateNav } from './RevenueNav.jsx'
import { monthKeyOf } from './revenueFormat.js'

/** @param {{ ownerKey: string }} props */
export default function DriverRevenueView({ ownerKey }) {
  const [tab, setTab] = useState('monthly')
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

  /** @param {number} delta */
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
