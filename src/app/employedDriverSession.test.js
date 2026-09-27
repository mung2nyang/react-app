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
    assert.equal(car.commEnabled, false)
    assert.equal(car.commType, 'percent')
    assert.equal(car.commission, '')
  })

  test('maps comm_enabled/comm_type/comm_value from assigned vehicle RPC', () => {
    const car = carFromAssignedSummary({
      id: 'veh-2',
      number: '서울12가3456',
      type: 'sub',
      driver_pay_mode: 'revenue',
      comm_enabled: true,
      comm_type: 'percent',
      comm_value: '30',
    })
    assert.equal(car.commEnabled, true)
    assert.equal(car.commType, 'percent')
    assert.equal(car.commission, '30')
  })

  test('comm_enabled falsy → commEnabled false, missing type defaults to percent', () => {
    const car = carFromAssignedSummary({
      id: 'veh-3',
      number: '99가9999',
      type: 'sub',
      comm_enabled: false,
      comm_value: '',
    })
    assert.equal(car.commEnabled, false)
    assert.equal(car.commType, 'percent')
    assert.equal(car.commission, '')
  })

  // 서버 함수가 돌려주는 산재 적용 여부(insurance_on)만 진짜 true일 때 산재 차감이 켜진다.
  test('insurance_on true → insuranceOn true (기사 본인 매출이 산재를 차감)', () => {
    const car = carFromAssignedSummary({ id: 'veh-4', number: '서울12가3456', type: 'sub', insurance_on: true })
    assert.equal(car.insuranceOn, true)
  })

  test('insurance_on false·null·없음 → insuranceOn false', () => {
    const base = { id: 'veh-5', number: '서울12가3456', type: 'sub' }
    assert.equal(carFromAssignedSummary({ ...base, insurance_on: false }).insuranceOn, false)
    assert.equal(carFromAssignedSummary({ ...base, insurance_on: null }).insuranceOn, false)
    assert.equal(carFromAssignedSummary(base).insuranceOn, false)
  })
})