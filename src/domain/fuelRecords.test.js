import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { FIXTURE_WORK } from './finance.fixtures.js'
import {
  buildFuelRecordRow,
  expenseFromFuelRecord,
  fuelItemFromExpense,
  groupFuelExpensesByDate,
  parseEntityNumber,
  replaceFuelExpenses,
} from './fuelRecords.js'

const ORIGINAL_COLUMNS = ['daily_log_id', 'user_id', 'vehicle_id', 'work_date', 'sequence', 'cost_amount', 'subsidy_amount', 'volume_liter', 'mileage_km', 'raw']

describe('fuel_records — 원본 supabase-sync 컬럼 매핑', () => {
  test('원본 parseEntityNumber와 같이 콤마 금액을 숫자로 바꾼다', () => {
    assert.equal(parseEntityNumber('80,000'), 80000)
    assert.equal(parseEntityNumber('5,000'), 5000)
    assert.equal(parseEntityNumber(40), 40)
    assert.equal(parseEntityNumber(''), 0)
  })

  test('원본 fixture 주유 한 줄을 fuel_records insert 행으로 옮긴다', () => {
    const item = FIXTURE_WORK.main['2026-05-10'].fuelItems[0]
    const row = buildFuelRecordRow(item, 0, {
      dailyLogId: 'log-1',
      userId: 'user-1',
      vehicleId: 'veh-1',
      workDate: '2026-05-10',
    })
    assert.deepEqual(Object.keys(row), ORIGINAL_COLUMNS)
    assert.equal(row.daily_log_id, 'log-1')
    assert.equal(row.cost_amount, 80000)
    assert.equal(row.subsidy_amount, 5000)
    assert.equal(row.volume_liter, 40)
    assert.equal(row.mileage_km, 0)
    assert.equal(row.raw.type, '주유')
    assert.equal(row.raw.liter, 40)
  })

  test('연습앱 liters를 원본 liter / volume_liter로 옮긴다', () => {
    const expense = {
      id: 'exp-1',
      kind: 'fuel',
      date: '2026-05-10',
      name: '주유',
      fuelType: '주유',
      payment: '카드',
      cost: 80000,
      subsidy: 5000,
      mileage: 120000,
      liters: 40,
    }
    const mapped = fuelItemFromExpense(expense)
    assert.equal(mapped.liter, 40)
    assert.equal(mapped.payment, '카드')
    const row = buildFuelRecordRow(expense, 1, {
      dailyLogId: 'log-1',
      userId: 'user-1',
      vehicleId: 'veh-1',
      workDate: '2026-05-10',
    })
    assert.equal(row.sequence, 1)
    assert.equal(row.volume_liter, 40)
    assert.equal(row.mileage_km, 120000)
    assert.equal(row.raw.id, 'exp-1')
    assert.equal(row.raw.payment, '카드')
  })

  test('raw가 있으면 컬럼 이름과 달라도 연습앱 주유 항목으로 되돌린다', () => {
    const row = buildFuelRecordRow({
      id: 'exp-9',
      kind: 'fuel',
      date: '2026-05-11',
      name: '요소수',
      fuelType: '요소수',
      payment: '현금',
      cost: 30000,
      subsidy: 0,
      mileage: 10,
      liters: 20.5,
    }, 0, {
      dailyLogId: 'log-2',
      userId: 'user-1',
      vehicleId: 'veh-1',
      workDate: '2026-05-11',
    })
    const brokenColumns = { ...row, cost_amount: 1, volume_liter: 99 }
    const back = expenseFromFuelRecord(brokenColumns, 0)
    assert.equal(back.id, 'exp-9')
    assert.equal(back.kind, 'fuel')
    assert.equal(back.date, '2026-05-11')
    assert.equal(back.fuelType, '요소수')
    assert.equal(back.payment, '현금')
    assert.equal(back.cost, 30000)
    assert.equal(back.liters, 20.5)
  })

  test('날짜별 묶음과 주유만 교체가 정비/기타를 건드리지 않는다', () => {
    const expenses = [
      { id: 'm1', kind: 'maint', date: '2026-05-10', cost: 1 },
      { id: 'f1', kind: 'fuel', date: '2026-05-10', cost: 2 },
      { id: 'x1', kind: 'misc', date: '2026-05-10', cost: 3 },
      { id: 'f2', kind: 'fuel', date: '2026-05-11', cost: 4 },
    ]
    const grouped = groupFuelExpensesByDate(expenses)
    assert.equal(grouped['2026-05-10'].length, 1)
    assert.equal(grouped['2026-05-11'][0].id, 'f2')
    const next = replaceFuelExpenses(expenses, [{ id: 'cloud', kind: 'fuel', date: '2026-05-12', cost: 9 }])
    assert.deepEqual(next.map((item) => item.id), ['m1', 'x1', 'cloud'])
  })
})
