// @ts-check
// 소속기사 매출 화면(D-2): 차주와 같은 카드 UI, 본인 정산 기준. scope 탭 없음.
import { useMemo, useState } from 'react'
import { getDriverSelfMonthlyDetail } from '../../domain/driverSelfRevenue.js'
import { shiftMonth } from '../../lib/calendar.js'
import { buildFinanceSettings } from '../../lib/ownerFinance.js'
import { useOwnerCars, useOwnerDrivers, useOwnerProfile, useOwnerSettings, useOwnerWorkDataByLogId } from '../../store/ownerDataHooks.js'
import OwnerMonthlyCards from './OwnerMonthlyCards.jsx'
import { DateNav } from './RevenueNav.jsx'
import { monthKeyOf, won } from './revenueFormat.js'

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
    () => getDriverSelfMonthlyDetail(monthKeyOf(year, month), settings, workDataByLogId),
    [year, month, settings, workDataByLogId],
  )

  const yearlyRows = useMemo(() => {
    /** @type {Array<{ month: number, netProfit: number }>} */
    const rows = []
    for (let m = 0; m < 12; m++) {
      const detail = getDriverSelfMonthlyDetail(monthKeyOf(year, m), settings, workDataByLogId)
      rows.push({ month: m + 1, netProfit: detail.netProfit })
    }
    return rows
  }, [year, settings, workDataByLogId])

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
      </div>

      {!yearly && <OwnerMonthlyCards key={`${year}-${month}`} detail={monthly} variant="driverSelf" />}

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
