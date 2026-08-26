import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { FIXTURE_WORK } from './finance.fixtures.js'
import {
  buildMiscExpenseRecordRow,
  expenseFromMiscRecord,
  groupMiscExpensesByDate,
  miscItemFromExpense,
  parseEntityNumber,
  replaceMiscExpenses,
} from './miscExpenseRecords.js'

const ORIGINAL_COLUMNS = ['daily_log_id', 'user_id', 'vehicle_id', 'work_date', 'sequence', 'cost_amount', 'raw']

describe('misc_expense_records — 원본 supabase-sync 컬럼 매핑', () => {
  test('원본 parseEntityNumber와 같이 콤마 금액을 숫자로 바꾼다', () => {
    assert.equal(parseEntityNumber('8,000'), 8000)
    assert.equal(parseEntityNumber(''), 0)
  })

  test('원본 fixture 기타 한 줄을 misc_expense_records insert 행으로 옮긴다', () => {
    const item = FIXTURE_WORK.main['2026-05-10'].miscItems[0]
    const row = buildMiscExpenseRecordRow(item, 0, {
      dailyLogId: 'log-1',
      userId: 'user-1',
      vehicleId: 'veh-1',
      workDate: '2026-05-10',
    })
    assert.deepEqual(Object.keys(row), ORIGINAL_COLUMNS)
    assert.equal(row.daily_log_id, 'log-1')
    assert.equal(row.cost_amount, 8000)
    assert.equal(row.mileage_km, undefined)
    assert.equal(row.raw.name, '통행료')
    assert.equal(row.raw.fare, '8,000')
  })

  test('연습앱 cost를 원본 fare / cost_amount로 옮긴다', () => {
    const expense = {
      id: 'exp-x1',
      kind: 'misc',
      date: '2026-05-10',
      name: '통행료',
      category: '통행료',
      payment: '카드',
      cost: 8000,
    }
    const mapped = miscItemFromExpense(expense)
    assert.equal(mapped.fare, 8000)
    assert.equal(mapped.category, '통행료')
    const row = buildMiscExpenseRecordRow(expense, 1, {
      dailyLogId: 'log-1',
      userId: 'user-1',
      vehicleId: 'veh-1',
      workDate: '2026-05-10',
    })
    assert.equal(row.sequence, 1)
    assert.equal(row.cost_amount, 8000)
    assert.equal(Object.keys(row).includes('mileage_km'), false)
    assert.equal(row.raw.id, 'exp-x1')
    assert.equal(row.raw.payment, '카드')
  })

  test('raw가 있으면 컬럼 이름과 달라도 연습앱 기타 항목으로 되돌린다', () => {
    const row = buildMiscExpenseRecordRow({
      id: 'exp-x9',
      kind: 'misc',
      date: '2026-05-11',
      name: '주차비',
      category: '주차비',
      payment: '현금',
      cost: 4000,
    }, 0, {
      dailyLogId: 'log-2',
      userId: 'user-1',
      vehicleId: 'veh-1',
      workDate: '2026-05-11',
    })
    const brokenColumns = { ...row, cost_amount: 1 }
    const back = expenseFromMiscRecord(brokenColumns, 0)
    assert.equal(back.id, 'exp-x9')
    assert.equal(back.kind, 'misc')
    assert.equal(back.date, '2026-05-11')
    assert.equal(back.name, '주차비')
    assert.equal(back.category, '주차비')
    assert.equal(back.payment, '현금')
    assert.equal(back.cost, 4000)
  })

  test('날짜별 묶음과 기타만 교체가 주유/정비를 건드리지 않는다', () => {
    const expenses = [
      { id: 'm1', kind: 'maint', date: '2026-05-10', cost: 1 },
      { id: 'f1', kind: 'fuel', date: '2026-05-10', cost: 2 },
      { id: 'x1', kind: 'misc', date: '2026-05-10', cost: 3 },
      { id: 'x2', kind: 'misc', date: '2026-05-11', cost: 4 },
    ]
    const grouped = groupMiscExpensesByDate(expenses)
    assert.equal(grouped['2026-05-10'].length, 1)
    assert.equal(grouped['2026-05-11'][0].id, 'x2')
    const next = replaceMiscExpenses(expenses, [{ id: 'cloud', kind: 'misc', date: '2026-05-12', cost: 9 }])
    assert.deepEqual(next.map((item) => item.id), ['m1', 'f1', 'cloud'])
  })
})
