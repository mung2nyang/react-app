import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { checkExpenseDraft, emptyExpenseDraft, expenseToDraft, upsertExpense } from './expenseDraft.js'
import { dedupeExpensesById } from './expenses.js'

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

  test('emptyExpenseDraft가 vehicleNumber를 draft에 담는다', () => {
    const draft = emptyExpenseDraft('fuel', '2026-08-01', '12가3456')
    assert.equal(draft.vehicleNumber, '12가3456')
    assert.equal(emptyExpenseDraft('maint', '2026-08-01').vehicleNumber, undefined)
    assert.equal(emptyExpenseDraft('misc', '2026-08-01', '  ').vehicleNumber, undefined)
  })

  test('upsertExpense가 vehicleNumber를 유지하고 trim한다', () => {
    const created = upsertExpense([], {
      kind: 'maint', date: '2026-08-01', name: '오일', cost: 1000, vehicleNumber: ' 12가3456 ',
    })
    assert.equal(created.error, undefined)
    assert.equal(created.items[0].vehicleNumber, '12가3456')
    const cleared = upsertExpense(created.items, {
      kind: 'maint', date: '2026-08-01', name: '오일', cost: 1000, vehicleNumber: '  ',
    }, created.items[0].id)
    assert.equal(cleared.error, undefined)
    assert.equal(cleared.items[0].vehicleNumber, undefined)
  })
})

describe('로드맵 77 — 지출 번호', () => {
  test('77-1: 같은 1/1000초에 만든 지출 두 건도 번호가 달라 둘 다 남는다', () => {
    const clock = mock.method(Date, 'now', () => 1760412345678)
    try {
      const first = upsertExpense([], { kind: 'fuel', date: '2026-10-15', cost: 1000 })
      const second = upsertExpense(first.items || [], { kind: 'fuel', date: '2026-10-15', cost: 2000 })
      const items = second.items || []
      assert.equal(items.length, 2)
      assert.notEqual(items[0].id, items[1].id)
      assert.match(String(items[1].id), /^exp_1760412345678_[a-z0-9]+$/)
      assert.deepEqual(dedupeExpensesById(items).map((item) => item.cost), [1000, 2000])
    } finally {
      clock.mock.restore()
    }
  })

  test('77-2: 옛 번호(exp-숫자) 지출도 그 번호로 고쳐진다', () => {
    const result = upsertExpense([{ id: 'exp-123', kind: 'fuel', date: '2026-10-01', cost: 500 }], { kind: 'fuel', date: '2026-10-01', cost: 700 }, 'exp-123')
    assert.equal(result.error, undefined)
    assert.deepEqual((result.items || []).map((item) => [item.id, item.cost]), [['exp-123', 700]])
  })
})

describe('checkExpenseDraft — 로드맵 82-B 어느 칸이 문제인지', () => {
  test('주유는 비용 칸, 정비·기타는 항목명 칸, 날짜 없으면 날짜', () => {
    assert.deepEqual(checkExpenseDraft({ kind: 'fuel', date: '2026-10-17', cost: 0 }), { field: 'cost', message: '비용을 입력해 주세요.' })
    assert.deepEqual(checkExpenseDraft({ kind: 'maint', date: '2026-10-17', name: '', cost: 0 }), { field: 'name', message: '항목명 또는 비용을 입력해 주세요.' })
    assert.equal(checkExpenseDraft({ kind: 'misc', date: '2026-10-17', name: '', cost: 3000 }), null)
    assert.equal(checkExpenseDraft({ kind: 'fuel', date: '', cost: 5000 })?.field, 'date')
  })
})

describe('expenseToDraft — 로드맵 101-B 내역을 고치기 창 입력값으로', () => {
  test('날짜를 안 주면 내역 날짜(차량 유지비), 주면 그 날짜(일지)', () => {
    const item = { id: 'e1', kind: /** @type {'fuel'} */ ('fuel'), date: '2026-08-01', fuelType: '요소수', payment: '현금', cost: 50000, subsidy: 3000, mileage: 1200, liters: 40.5, vehicleNumber: '12가3456' }
    assert.deepEqual(expenseToDraft(item), {
      kind: 'fuel', date: '2026-08-01', name: '', category: '엔진/미션',
      fuelType: '요소수', payment: '현금', cost: 50000, subsidy: 3000, mileage: 1200,
      liters: '40.5', vehicleNumber: '12가3456',
    })
    assert.equal(expenseToDraft(item, '2026-08-05').date, '2026-08-05')
  })

  test('빈 칸은 기본값, 기타는 분류 기본이 통행료', () => {
    const draft = expenseToDraft({ id: 'e2', kind: 'misc', date: '2026-08-01' })
    assert.equal(draft.category, '통행료')
    assert.equal(draft.fuelType, '주유')
    assert.equal(draft.payment, '카드')
    assert.equal(draft.cost, 0)
    assert.equal(draft.liters, '')
  })
})
