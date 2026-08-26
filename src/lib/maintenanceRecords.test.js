import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { FIXTURE_WORK } from './finance.fixtures.js'
import {
  buildMaintenanceRecordRow,
  expenseFromMaintenanceRecord,
  groupMaintExpensesByDate,
  maintItemFromExpense,
  parseEntityNumber,
  replaceMaintExpenses,
} from './maintenanceRecords.js'

const ORIGINAL_COLUMNS = ['daily_log_id', 'user_id', 'vehicle_id', 'work_date', 'sequence', 'cost_amount', 'mileage_km', 'raw']

describe('maintenance_records — 원본 supabase-sync 컬럼 매핑', () => {
  test('원본 parseEntityNumber와 같이 콤마 금액을 숫자로 바꾼다', () => {
    assert.equal(parseEntityNumber('30,000'), 30000)
    assert.equal(parseEntityNumber('20,000'), 20000)
    assert.equal(parseEntityNumber(''), 0)
  })

  test('원본 fixture 정비 한 줄을 maintenance_records insert 행으로 옮긴다', () => {
    const item = FIXTURE_WORK.main['2026-05-10'].maintItems[0]
    const row = buildMaintenanceRecordRow(item, 0, {
      dailyLogId: 'log-1',
      userId: 'user-1',
      vehicleId: 'veh-1',
      workDate: '2026-05-10',
    })
    assert.deepEqual(Object.keys(row), ORIGINAL_COLUMNS)
    assert.equal(row.daily_log_id, 'log-1')
    assert.equal(row.cost_amount, 30000)
    assert.equal(row.mileage_km, 0)
    assert.equal(row.raw.name, '오일')
    assert.equal(row.raw.fare, '30,000')
  })

  test('연습앱 cost를 원본 fare / cost_amount로 옮긴다', () => {
    const expense = {
      id: 'exp-m1',
      kind: 'maint',
      date: '2026-05-10',
      name: '오일',
      category: '소모품',
      payment: '카드',
      cost: 30000,
      mileage: 120000,
    }
    const mapped = maintItemFromExpense(expense)
    assert.equal(mapped.fare, 30000)
    assert.equal(mapped.category, '소모품')
    const row = buildMaintenanceRecordRow(expense, 1, {
      dailyLogId: 'log-1',
      userId: 'user-1',
      vehicleId: 'veh-1',
      workDate: '2026-05-10',
    })
    assert.equal(row.sequence, 1)
    assert.equal(row.cost_amount, 30000)
    assert.equal(row.mileage_km, 120000)
    assert.equal(row.raw.id, 'exp-m1')
    assert.equal(row.raw.payment, '카드')
  })

  test('raw가 있으면 컬럼 이름과 달라도 연습앱 정비 항목으로 되돌린다', () => {
    const row = buildMaintenanceRecordRow({
      id: 'exp-m9',
      kind: 'maint',
      date: '2026-05-11',
      name: '정비',
      category: '엔진/미션',
      payment: '현금',
      cost: 20000,
      mileage: 10,
    }, 0, {
      dailyLogId: 'log-2',
      userId: 'user-1',
      vehicleId: 'veh-1',
      workDate: '2026-05-11',
    })
    const brokenColumns = { ...row, cost_amount: 1, mileage_km: 99 }
    const back = expenseFromMaintenanceRecord(brokenColumns, 0)
    assert.equal(back.id, 'exp-m9')
    assert.equal(back.kind, 'maint')
    assert.equal(back.date, '2026-05-11')
    assert.equal(back.name, '정비')
    assert.equal(back.category, '엔진/미션')
    assert.equal(back.payment, '현금')
    assert.equal(back.cost, 20000)
    assert.equal(back.mileage, 10)
  })

  test('날짜별 묶음과 정비만 교체가 주유/기타를 건드리지 않는다', () => {
    const expenses = [
      { id: 'm1', kind: 'maint', date: '2026-05-10', cost: 1 },
      { id: 'f1', kind: 'fuel', date: '2026-05-10', cost: 2 },
      { id: 'x1', kind: 'misc', date: '2026-05-10', cost: 3 },
      { id: 'm2', kind: 'maint', date: '2026-05-11', cost: 4 },
    ]
    const grouped = groupMaintExpensesByDate(expenses)
    assert.equal(grouped['2026-05-10'].length, 1)
    assert.equal(grouped['2026-05-11'][0].id, 'm2')
    const next = replaceMaintExpenses(expenses, [{ id: 'cloud', kind: 'maint', date: '2026-05-12', cost: 9 }])
    assert.deepEqual(next.map((item) => item.id), ['f1', 'x1', 'cloud'])
  })
})
