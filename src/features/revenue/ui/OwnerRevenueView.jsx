// @ts-check
// 차주(오너) 손익 화면. 기사 탭에서 개별 기사(차량) 드롭다운 필터.
import { useEffect, useMemo, useState } from 'react'
import { isVehicleRevenueSharedWithOwner } from '../../../domain/cars.js'
import { getOwnerMonthlyFinanceDetail } from '../../../lib/finance.js'
import { useOwnerCars, useOwnerDriverExpenses, useOwnerExpenses, useOwnerWorkDataByLogId } from '../../../data/store/ownerDataHooks.js'
import OwnerMonthlyCards from './OwnerMonthlyCards.jsx'
import { RevenuePeriodBar, RevenueYearList } from './RevenuePeriodParts.jsx'
import { buildYearlyRows, useRevenueFinanceSettings, useRevenuePeriod } from './revenuePeriod.js'
import { monthKeyOf } from './revenueFormat.js'
import { scopeSettingsToVehicle, scopeWorkDataToVehicle } from './driverRevenueScope.js'
import { filterDriverExpensesByVehicle } from '../../../domain/financeOwnerExpenseSweep.js'
import AppDropdown from '../../../shared/ui/AppDropdown.jsx'
const SCOPES = [
  { value: 'all', label: '전체 손익' },
  { value: 'owner', label: '차주' },
  { value: 'driver', label: '기사' },
]

const ALL_DRIVERS = ''

/** @param {{ ownerKey: string }} props */
export default function OwnerRevenueView({ ownerKey }) {
  const period = useRevenuePeriod()
  const { year, month, yearly } = period
  const [scope, setScope] = useState('owner')
  const [driverVehicle, setDriverVehicle] = useState(ALL_DRIVERS)

  const cars = useOwnerCars(ownerKey)
  const settings = useRevenueFinanceSettings(ownerKey)
  const workDataByLogId = useOwnerWorkDataByLogId(ownerKey)
  const expensesAll = useOwnerExpenses(ownerKey)
  const driverExpensesAll = useOwnerDriverExpenses(ownerKey)

  const subCars = useMemo(
    () => (Array.isArray(cars) ? cars : []).filter(
      (car) => car?.type === 'sub' && isVehicleRevenueSharedWithOwner(car),
    ),
    [cars],
  )

  const hasSubCar = subCars.length > 0
  const visibleScopes = useMemo(
    () => (hasSubCar ? SCOPES : SCOPES.filter((item) => item.value !== 'driver')),
    [hasSubCar],
  )

  useEffect(() => {
    if (scope === 'driver' && !hasSubCar) setScope('owner')
  }, [scope, hasSubCar])

  useEffect(() => {
    if (!driverVehicle) return
    const stillPresent = subCars.some((car) => String(car.number || '').trim() === driverVehicle)
    if (!stillPresent) setDriverVehicle(ALL_DRIVERS)
  }, [subCars, driverVehicle])

  const scopedForDriver = scope === 'driver' && !!driverVehicle
  const financeSettings = useMemo(
    () => (scopedForDriver ? scopeSettingsToVehicle(settings, driverVehicle) : settings),
    [scopedForDriver, settings, driverVehicle],
  )
  const financeWork = useMemo(
    () => (scopedForDriver ? scopeWorkDataToVehicle(workDataByLogId, driverVehicle) : workDataByLogId),
    [scopedForDriver, workDataByLogId, driverVehicle],
  )
  const driverExpenses = useMemo(
    () => (scopedForDriver ? filterDriverExpensesByVehicle(driverExpensesAll, driverVehicle) : driverExpensesAll),
    [scopedForDriver, driverExpensesAll, driverVehicle],
  )
  const expenses = useMemo(
    () => (scopedForDriver ? filterDriverExpensesByVehicle(expensesAll, driverVehicle) : expensesAll),
    [scopedForDriver, expensesAll, driverVehicle],
  )

  const monthly = useMemo(
    () => getOwnerMonthlyFinanceDetail(monthKeyOf(year, month), scope, financeSettings, financeWork, expenses, driverExpenses),
    [year, month, scope, financeSettings, financeWork, expenses, driverExpenses],
  )

  const yearlyRows = useMemo(
    () => buildYearlyRows(year, (monthKey) => getOwnerMonthlyFinanceDetail(monthKey, scope, financeSettings, financeWork, expenses, driverExpenses)),
    [year, scope, financeSettings, financeWork, expenses, driverExpenses],
  )

  const showDriverSelect = scope === 'driver' && subCars.length > 1

  return (
    <>
      <RevenuePeriodBar period={period}>
        <div className="revenue-scope-tabs">
          {visibleScopes.map((item) => (
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
        {showDriverSelect && (
          <div className="revenue-driver-select">
            <AppDropdown
              label="기사 선택"
              value={driverVehicle}
              options={[
                { value: ALL_DRIVERS, label: '전체 기사 합산' },
                ...subCars.map((car) => {
                  const vehicleNumber = String(car.number || '').trim()
                  const name = String(car.driverName || '기사').trim() || '기사'
                  return { value: vehicleNumber, label: `${name}(${vehicleNumber})` }
                }),
              ]}
              onChange={setDriverVehicle}
              className="app-dropdown-boxed"
            />
          </div>
        )}
      </RevenuePeriodBar>

      {!yearly && <OwnerMonthlyCards key={`${scope}-${driverVehicle}-${year}-${month}`} detail={monthly} scope={scope} />}

      {yearly && <RevenueYearList year={year} rows={yearlyRows} />}
    </>
  )
}
