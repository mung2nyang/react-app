// @ts-check
// 소속기사 매출 화면(D-2): 차주와 같은 카드 UI, 본인 정산 기준. scope 탭 없음.
import { useMemo } from 'react'
import { getDriverSelfMonthlyDetail } from '../../domain/driverSelfRevenue.js'
import { useOwnerExpenses, useOwnerWorkDataByLogId } from '../../data/store/ownerDataHooks.js'
import OwnerMonthlyCards from './OwnerMonthlyCards.jsx'
import { RevenuePeriodBar, RevenueYearList } from './RevenuePeriodParts.jsx'
import { buildYearlyRows, useRevenueFinanceSettings, useRevenuePeriod } from './revenuePeriod.js'
import { monthKeyOf } from './revenueFormat.js'

/** @param {{ ownerKey: string }} props */
export default function DriverRevenueView({ ownerKey }) {
  const period = useRevenuePeriod()
  const { year, month, yearly } = period
  const settings = useRevenueFinanceSettings(ownerKey)
  const workDataByLogId = useOwnerWorkDataByLogId(ownerKey)
  const expenses = useOwnerExpenses(ownerKey)

  const monthly = useMemo(
    () => getDriverSelfMonthlyDetail(monthKeyOf(year, month), settings, workDataByLogId, expenses),
    [year, month, settings, workDataByLogId, expenses],
  )
  const yearlyRows = useMemo(
    () => buildYearlyRows(year, (monthKey) => getDriverSelfMonthlyDetail(monthKey, settings, workDataByLogId, expenses)),
    [year, settings, workDataByLogId, expenses],
  )

  return (
    <>
      <RevenuePeriodBar period={period} />
      {!yearly && <OwnerMonthlyCards key={`${year}-${month}`} detail={monthly} variant="driverSelf" />}
      {yearly && <RevenueYearList year={year} rows={yearlyRows} />}
    </>
  )
}
