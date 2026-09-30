// @ts-check
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf } = createFakeSupabase()
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { syncExpenseItemsForVehicle } = await import('./syncExpenseItems.js')

/** @typedef {import('../domain/expenseTypes.js').ExpenseItem} ExpenseItem */

/** @param {unknown} value @param {string} key */
function field(value, key) {
  return value && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value)[key] : undefined
}

/** @type {Array<Record<string, import('../store/atomicPersist.js').JsonValue>>} */
const MAINT_ROWS = [
  { id: 'srv-owner', work_date: '2026-09-10', sequence: 0, raw: { id: 'owner-m1', kind: 'maint', date: '2026-09-10', cost: 300 } },
  { id: 'srv-drv', work_date: '2026-09-10', sequence: 1, raw: { id: 'drv-m1', kind: 'maint', date: '2026-09-10', cost: 100 } },
  { id: 'srv-legacy', work_date: '2026-09-11', sequence: 0, raw: { name: '옛정비' } },
]

/** @type {Array<string>} */
let events = []

// 연동 차량 veh-1: 09-10 하루 기록 dl-1. 정비 3행 — 차주 것(기사는 모름)·기사가 알던 것·id 없는 옛 행.
beforeEach(() => {
  resetHandlers()
  events = []
  handlers.daily_logs = {
    select: (filters) => (field(filters, 'work_date')
      ? { data: { id: 'dl-new' }, error: null }
      : { data: [{ id: 'dl-1', work_date: '2026-09-10' }], error: null }),
    upsert: (row, options) => {
      events.push(`daily_logs.upsert:${String(field(row, 'work_date'))}:ignore=${String(field(options, 'ignoreDuplicates'))}`)
      return { data: null, error: null }
    },
  }
  handlers.maintenance_records = {
    select: () => ({
      data: MAINT_ROWS,
      error: null,
    }),
    insert: (row) => { events.push(`maint.insert:${String(field(row, 'daily_log_id'))}`); return { data: null, error: null } },
    update: (row, filters) => {
      events.push(`maint.update:${String(field(filters, 'id'))}:user=${String(field(row, 'user_id'))}:cost=${String(field(row, 'cost_amount'))}:rawId=${String(field(field(row, 'raw'), 'id'))}`)
      return { data: null, error: null }
    },
    delete: (filters) => { events.push(`maint.delete:${String(field(filters, 'id'))}`); return { data: null, error: null } },
  }
  handlers.fuel_records = {
    select: (filters) => (field(filters, 'vehicle_id') === 'veh-main'
      ? { data: [{ id: 'srv-main-old', work_date: '2026-09-10', sequence: 0, raw: { id: 'old-f1' } }], error: null }
      : { data: [], error: null }),
    insert: (row) => {
      events.push(`fuel.insert:${String(field(row, 'daily_log_id'))}:seq=${String(field(row, 'sequence'))}`)
      return { data: null, error: null }
    },
    delete: (filters) => { events.push(`fuel.delete:${String(field(filters, 'id'))}`); return { data: null, error: null } },
  }
  handlers.misc_expense_records = { select: () => ({ data: [], error: null }) }
})

/** @type {ExpenseItem} */
const DRIVER_MAINT = { id: 'drv-m1', kind: 'maint', date: '2026-09-10', cost: 100 }

describe('syncExpenseItemsForVehicle — 로드맵 5-B-1 항목 단위 저장', () => {
  test('새 항목만 넣고, 안 바뀐 항목과 내가 모르는 차주 항목은 건드리지 않는다', async () => {
    /** @type {ExpenseItem} */
    const fuel = { id: 'drv-f1', kind: 'fuel', date: '2026-09-10', cost: 5000 }
    await syncExpenseItemsForVehicle('driver-1', 'veh-1', [DRIVER_MAINT], [DRIVER_MAINT, fuel], {})
    assert.deepEqual(events, ['fuel.insert:dl-1:seq=0'])
  })

  test('지운 항목은 내가 알던 것만 서버 id로 지운다(차주 행은 남는다)', async () => {
    await syncExpenseItemsForVehicle('driver-1', 'veh-1', [DRIVER_MAINT], [], {})
    assert.deepEqual(events, ['maint.delete:srv-drv'])
  })

  test('고치기는 그 행만, 쓴 사람(user_id)은 보내지 않는다', async () => {
    await syncExpenseItemsForVehicle('driver-1', 'veh-1', [DRIVER_MAINT], [{ ...DRIVER_MAINT, cost: 200 }], {})
    assert.deepEqual(events, ['maint.update:srv-drv:user=undefined:cost=200:rawId=drv-m1'])
  })

  test('id 없는 옛 행도 불러올 때와 같은 임시 id로 찾아 고치고, 고치면 raw.id가 채워진다', async () => {
    /** @type {ExpenseItem} */
    const legacy = { id: 'maint-2026-09-11-0', kind: 'maint', date: '2026-09-11', name: '옛정비', cost: 0 }
    await syncExpenseItemsForVehicle('driver-1', 'veh-1', [legacy], [{ ...legacy, cost: 5000 }], {})
    assert.deepEqual(events, [
      'daily_logs.upsert:2026-09-11:ignore=true',
      'maint.update:srv-legacy:user=undefined:cost=5000:rawId=maint-2026-09-11-0',
    ])
  })

  test('하루 기록 줄이 없는 날은 덮어쓰지 않는 방식(ignoreDuplicates)으로 만들고 다시 읽은 id에 넣는다', async () => {
    /** @type {ExpenseItem} */
    const fuel = { id: 'drv-f2', kind: 'fuel', date: '2026-09-12', cost: 7000 }
    await syncExpenseItemsForVehicle('driver-1', 'veh-1', [], [fuel], {})
    assert.deepEqual(events, ['daily_logs.upsert:2026-09-12:ignore=true', 'fuel.insert:dl-new:seq=0'])
  })

  test('안 바뀐 항목이 서버에 없으면(상대가 지움) 되살리지 않는다', async () => {
    /** @type {ExpenseItem} */
    const gone = { id: 'drv-f-gone', kind: 'fuel', date: '2026-09-10', cost: 1 }
    await syncExpenseItemsForVehicle('driver-1', 'veh-1', [gone], [gone], {})
    assert.deepEqual(events, [])
    assert.equal(countOf('fuel_records', 'insert'), 0)
  })

  test('5-B-2 옛 항목 옮기기: 안 바뀐 항목이 연동 칸에 없어도 메인 칸에 같은 id가 있으면 넣는다', async () => {
    /** @type {ExpenseItem} */
    const old = { id: 'old-f1', kind: 'fuel', date: '2026-09-10', cost: 9000, vehicleNumber: '11가1111' }
    await syncExpenseItemsForVehicle('owner-1', 'veh-1', [old], [old], {}, 'veh-main')
    assert.deepEqual(events, ['fuel.insert:dl-1:seq=0'])
  })

  test('5-B-2 옛 항목 옮기기: 메인 칸에도 없으면 상대가 지운 것이라 되살리지 않는다', async () => {
    /** @type {ExpenseItem} */
    const gone = { id: 'drv-f-gone', kind: 'fuel', date: '2026-09-10', cost: 1, vehicleNumber: '11가1111' }
    await syncExpenseItemsForVehicle('owner-1', 'veh-1', [gone], [gone], {}, 'veh-main')
    assert.deepEqual(events, [])
  })
})
