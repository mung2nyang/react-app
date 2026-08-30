import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { dedupeExpensesById, groupExpensesByDate, upsertExpense } from './expenses.js'

describe('정비/기타 저장 조건', () => {
  test('항목명만 있어도 저장된다', () => {
    const result = upsertExpense([], { kind: 'maint', date: '2026-08-01', name: '엔진오일' })
    assert.equal(result.error, undefined)
    assert.equal(result.items[0].name, '엔진오일')
    assert.equal(result.items[0].cost, 0)
  })

  test('비용만 있어도 저장된다', () => {
    const result = upsertExpense([], { kind: 'misc', date: '2026-08-01', cost: 8000 })
    assert.equal(result.error, undefined)
    assert.equal(result.items[0].cost, 8000)
  })

  test('항목명과 비용이 둘 다 없으면 거절한다', () => {
    const result = upsertExpense([], { kind: 'maint', date: '2026-08-01' })
    assert.equal(result.error, '항목명 또는 비용을 입력해 주세요.')
  })

  test('날짜별로 묶어 하루 합계를 낸다', () => {
    const groups = groupExpensesByDate([
      { id: '2', date: '2026-08-02', cost: 1000 },
      { id: '1a', date: '2026-08-01', cost: 3000 },
      { id: '1b', date: '2026-08-01', cost: 2000 },
    ])
    assert.equal(groups.length, 2)
    assert.equal(groups[0].date, '2026-08-01')
    assert.equal(groups[0].dailyTotal, 5000)
    assert.equal(groups[0].items.length, 2)
    assert.equal(groups[1].date, '2026-08-02')
  })

  test('같은 id는 한 줄만 남긴다', () => {
    const next = dedupeExpensesById([
      { id: 'a', kind: 'fuel', date: '2026-08-01', cost: 1 },
      { id: 'a', kind: 'fuel', date: '2026-08-01', cost: 2 },
      { id: 'b', kind: 'maint', date: '2026-08-01', cost: 3 },
    ])
    assert.equal(next.length, 2)
    assert.equal(next[0].cost, 1)
    assert.equal(next[1].id, 'b')
  })
})
