// 로드맵 67-B — 지출 저장·점검표 읽기도 서버(Max rows 1000)처럼 잘라 주는 가짜 서버에서 끝까지 받는지.
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'
import { createFakeSupabase } from '../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf } = createFakeSupabase()
mock.module('./supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { syncExpenseItemsForVehicle } = await import('../sync/syncExpenseItems.js')
const { fetchVehiclesDailyInspections } = await import('../sync/dailyInspections.js')

/** @typedef {import('../../domain/expenseTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {import('../store/atomicPersist.js').JsonValue} JsonValue */

/**
 * @param {Array<JsonValue>} rows
 * @param {JsonValue|undefined} filters
 */
function pageLikeServer(rows, filters) {
  const range = filters && typeof filters === 'object' && !Array.isArray(filters) ? filters.range : undefined
  const [from, to] = String(range ?? '0-999').split('-').map(Number)
  return { data: rows.slice(from, Math.min(to, from + 999) + 1), error: null }
}

const DK = '2026-09-10'
const fuelRows = Array.from({ length: 1200 }, (_, i) => ({
  id: `srv-${i}`, work_date: DK, sequence: i, cost_amount: 1000, raw: { id: `f-${i}`, kind: 'fuel', date: DK, cost: 1000 },
}))
/** @type {Array<ExpenseItem>} */
const previous = fuelRows.map((row) => ({ id: row.raw.id, kind: 'fuel', date: DK, cost: 1000 }))

/** @type {Array<string>} */
let events = []

beforeEach(() => {
  resetHandlers()
  events = []
  handlers.daily_logs = {
    select: (filters) => pageLikeServer([{ id: 'dl-1', work_date: DK }], filters),
  }
  handlers.fuel_records = {
    select: (filters) => pageLikeServer(fuelRows, filters),
    insert: () => { events.push('insert'); return { data: null, error: null } },
    update: (_row, filters) => { events.push(`update:${String(filters && typeof filters === 'object' && !Array.isArray(filters) ? filters.id : '')}`); return { data: null, error: null } },
    delete: (filters) => { events.push(`delete:${String(filters && typeof filters === 'object' && !Array.isArray(filters) ? filters.id : '')}`); return { data: null, error: null } },
  }
})

test('E-1 연동 차량 지출 1,200건 중 1,100번째를 고치면 update 1건·insert 0건', async () => {
  const next = previous.map((item, i) => (i === 1100 ? { ...item, cost: 2000 } : item))
  await syncExpenseItemsForVehicle('user-67b', 'veh-67b', previous, next, {})
  assert.deepEqual(events, ['update:srv-1100'], '서버에 있는 항목을 없다고 보고 다시 넣으면 중복이 생긴다')
})

test('E-2 연동 차량 지출 1,200건 중 1,150번째를 지우면 그 행 delete 1건', async () => {
  const next = previous.filter((_, i) => i !== 1150)
  await syncExpenseItemsForVehicle('user-67b', 'veh-67b', previous, next, {})
  assert.deepEqual(events, ['delete:srv-1150'], '지운 항목을 못 찾으면 서버에 남는다')
  assert.equal(countOf('fuel_records', 'select'), 2)
})

test('I-1 점검표 차량 2대 1,300장 → 1,300장 모두 차량·날짜별로', async () => {
  const start = Date.UTC(2024, 0, 1)
  const rows = Array.from({ length: 1300 }, (_, i) => ({
    vehicle_id: i % 2 === 0 ? 'v1' : 'v2',
    work_date: new Date(start + Math.floor(i / 2) * 86400000).toISOString().slice(0, 10),
    items: {},
    action_note: null,
    inspector_name: '김',
  }))
  handlers.daily_inspections = { select: (filters) => pageLikeServer(rows, filters) }
  const byVehicle = await fetchVehiclesDailyInspections(['v1', 'v2'])
  assert.equal(Object.keys(byVehicle.v1 || {}).length, 650)
  assert.equal(Object.keys(byVehicle.v2 || {}).length, 650)
})
