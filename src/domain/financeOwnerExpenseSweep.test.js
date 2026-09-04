// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  filterDriverExpensesByVehicle,
  selectExpensesForScope,
  sweepExpenseItems,
} from './financeOwnerExpenseSweep.js'

const OWNER = [
  { id: 'o-m', kind: 'maint', date: '2026-05-10', name: '차주정비', cost: 10000 },
  { id: 'o-f', kind: 'fuel', date: '2026-05-10', fuelType: '주유', cost: 20000, subsidy: 3000, liters: 10 },
]
const DRIVER = [
  { id: 'd-m', kind: 'maint', date: '2026-05-10', name: '기사정비', cost: 40000, vehicleNumber: '서울12가3456' },
  { id: 'd-f', kind: 'fuel', date: '2026-05-11', fuelType: '주유', cost: 50000, subsidy: 7000, liters: 20, vehicleNumber: '부산33나1111' },
  { id: 'd-other-month', kind: 'misc', date: '2026-04-01', name: '지난달', cost: 999, vehicleNumber: '서울12가3456' },
]

describe('selectExpensesForScope', () => {
  test('owner = expenses만, driver = driverExpenses만, all = 합', () => {
    assert.equal(selectExpensesForScope('owner', OWNER, DRIVER).length, 2)
    assert.equal(selectExpensesForScope('owner', OWNER, DRIVER)[0].id, 'o-m')
    assert.equal(selectExpensesForScope('driver', OWNER, DRIVER).length, 3)
    assert.equal(selectExpensesForScope('driver', OWNER, DRIVER)[0].id, 'd-m')
    assert.equal(selectExpensesForScope('all', OWNER, DRIVER).length, 5)
  })
})

describe('filterDriverExpensesByVehicle', () => {
  test('vehicleNumber로 해당 차량만', () => {
    const filtered = filterDriverExpensesByVehicle(DRIVER, '서울12가3456')
    assert.equal(filtered.length, 2)
    assert.ok(filtered.every((item) => item.vehicleNumber === '서울12가3456'))
  })

  test('빈 vehicleNumber면 전체', () => {
    assert.equal(filterDriverExpensesByVehicle(DRIVER, '').length, 3)
  })
})

describe('sweepExpenseItems', () => {
  test('monthKey 밖 항목 제외 + subsidy를 fuelSubsidy에 동일 규칙으로', () => {
    const buckets = sweepExpenseItems('2026-05', OWNER.concat(DRIVER))
    assert.equal(buckets.maintItems.length, 2)
    assert.equal(buckets.fuelItems.length, 2)
    assert.equal(buckets.miscItems.length, 0, '4월 misc는 제외')
    assert.equal(buckets.fuelSubsidyTotal, 10000)
    assert.equal(buckets.fuelSubsidyItems.length, 2)
    assert.deepEqual(
      buckets.fuelSubsidyItems.map((item) => item.amount).sort((a, b) => a - b),
      [3000, 7000],
    )
  })

  test('driver fuel subsidy만 넣어도 owner와 같은 버킷 필드', () => {
    const buckets = sweepExpenseItems('2026-05', [
      { id: 'd-f', kind: 'fuel', date: '2026-05-11', fuelType: '경유', cost: 1, subsidy: 2500, liters: 1, vehicleNumber: '서울12가3456' },
    ])
    assert.equal(buckets.fuelSubsidyTotal, 2500)
    assert.equal(buckets.fuelItems[0].amount, 1)
  })
})
