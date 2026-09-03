// @ts-check
import '../testSupport/stubSupabaseClient.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { ownerKeyFromSession } from './boot.js'
import { carFromAssignedSummary } from '../lib/hydrateEmployedDriver.js'

describe('ownerKeyFromSession', () => {
  test('linkedOwnerId prefers owner id', () => {
    assert.equal(
      ownerKeyFromSession({
        userId: 'driver-1',
        linkedOwnerId: 'owner-9',
        accountType: 'employed_driver',
      }),
      'owner-9',
    )
  })

  test('falls back to userId or guest', () => {
    assert.equal(ownerKeyFromSession({ userId: 'u1', guestMode: false }), 'u1')
    assert.equal(ownerKeyFromSession({ guestMode: true }), 'guest')
    assert.equal(ownerKeyFromSession(undefined), 'guest')
  })
})

describe('carFromAssignedSummary', () => {
  test('maps RPC summary row to LocalCar', () => {
    const car = carFromAssignedSummary({
      id: 'veh-1',
      number: '12가3456',
      type: 'sub',
      tonnage: '5',
      settlement_mode: 'default',
      driver_pay_mode: 'revenue',
      driver_salary_amount: 100,
    })
    assert.equal(car.supabaseId, 'veh-1')
    assert.equal(car.number, '12가3456')
    assert.equal(car.type, 'sub')
    assert.equal(car.driverPayMode, 'revenue')
    assert.equal(car.driverSalaryAmount, 100)
  })
})