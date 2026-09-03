// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { FIXTURE_SETTINGS, FIXTURE_WORK, MONTH_KEY } from '../../domain/finance.fixtures.js'
import { getMonthlyFareRevenue } from '../../domain/financeCore.js'
import {
  resolveDriverVehicleNumber,
  scopeSettingsToVehicle,
  scopeWorkDataToVehicle,
} from './driverRevenueScope.js'

describe('Step 9 slice C-2 driverRevenueScope', () => {
  const mine = '서울12가3456'
  const other = '부산33나1111'
  /** @type {Array<import('../../lib/outboxTypes.js').DriverRecord>} */
  const drivers = [
    { id: 'd1', phone: '010-1111-2222', status: 'linked', vehicleNumber: mine },
    { id: 'd2', phone: '010-3333-4444', status: 'linked', vehicleNumber: other },
  ]

  test('resolveDriverVehicleNumber matches digits and requires linked+vehicle', () => {
    assert.equal(resolveDriverVehicleNumber(drivers, '01011112222'), mine)
    assert.equal(resolveDriverVehicleNumber(drivers, '010-1111-2222'), mine)
    assert.equal(resolveDriverVehicleNumber(/** @type {Array<import('../../lib/outboxTypes.js').DriverRecord>} */ ([
      { id: 'p', phone: '010-1111-2222', status: 'pending', vehicleNumber: mine },
    ]), '010-1111-2222'), null)
    assert.equal(resolveDriverVehicleNumber(/** @type {Array<import('../../lib/outboxTypes.js').DriverRecord>} */ ([
      { id: 'e', phone: '010-1111-2222', status: 'linked', vehicleNumber: '' },
    ]), '010-1111-2222'), null)
    assert.equal(resolveDriverVehicleNumber(drivers, ''), null)
  })

  test('scoped getMonthlyFareRevenue excludes other driver fare and plates', () => {
    const vehicleNumber = resolveDriverVehicleNumber(drivers, '010-1111-2222')
    const scopedSettings = scopeSettingsToVehicle(FIXTURE_SETTINGS, vehicleNumber)
    const scopedWork = scopeWorkDataToVehicle(FIXTURE_WORK, vehicleNumber)
    const mineOnly = getMonthlyFareRevenue(MONTH_KEY, scopedSettings, scopedWork)
    const all = getMonthlyFareRevenue(MONTH_KEY, FIXTURE_SETTINGS, FIXTURE_WORK)

    assert.ok(mineOnly.totalFare > 0)
    assert.ok(mineOnly.totalFare < all.totalFare)
    assert.deepEqual(
      mineOnly.byVehicle.filter((row) => row.logId !== 'main').map((row) => row.logId),
      [mine],
    )
    assert.ok(!mineOnly.byVehicle.some((row) => row.logId === other))

    const empty = getMonthlyFareRevenue(
      MONTH_KEY,
      scopeSettingsToVehicle(FIXTURE_SETTINGS, null),
      scopeWorkDataToVehicle(FIXTURE_WORK, null),
    )
    assert.equal(empty.totalFare, 0)
    assert.equal(empty.tripCount, 0)
  })

  test('slice D: scopeSettingsToVehicle keeps one car for owner driver dropdown', () => {
    const scoped = scopeSettingsToVehicle(FIXTURE_SETTINGS, mine)
    const cars = Array.isArray(scoped.cars) ? scoped.cars : []
    assert.equal(cars.length, 1)
    assert.equal(cars[0]?.number, mine)
    const work = scopeWorkDataToVehicle(FIXTURE_WORK, mine)
    assert.deepEqual(Object.keys(work), [mine])
  })
})
