// @ts-check
// 로드맵 9-B-2 — 일상점검표 서버 읽기·저장: 차량+날짜 1장, 덮어쓰기, 작성자·점검자 이름, 서버 값 형식 검사.
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers } = createFakeSupabase()
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { fetchDailyInspection, saveDailyInspection } = await import('./dailyInspections.js')
const { beginSessionEpoch, endCloudSession } = await import('./cloudSession.js')
const { setHydration } = await import('../store/app-store.js')

beforeEach(() => { resetHandlers(); endCloudSession() })

test('읽기: 차량·날짜로 1장, 형식 검사 후 돌려줌 / 없으면 null', async () => {
  /** @type {Array<import('../testSupport/fakeSupabaseClient.js').EqFilters>} */
  const filters = []
  handlers.daily_inspections = { select: (f) => { filters.push(/** @type {import('../testSupport/fakeSupabaseClient.js').EqFilters} */ (f)); return { data: { items: { tires: 'bad', bogus: 'good' }, action_note: '타이어 교체 예정', inspector_name: '김기사' }, error: null } } }
  const got = await fetchDailyInspection('veh-1', '2026-10-01')
  assert.deepEqual(got, { items: { tires: 'bad' }, actionNote: '타이어 교체 예정', inspectorName: '김기사' })
  assert.deepEqual(filters[0], { vehicle_id: 'veh-1', work_date: '2026-10-01' })
  handlers.daily_inspections = { select: () => ({ data: null, error: null }) }
  assert.equal(await fetchDailyInspection('veh-1', '2026-10-02'), null)
})

test('읽기 실패는 던짐', async () => {
  handlers.daily_inspections = { select: () => ({ data: null, error: { message: 'down' } }) }
  await assert.rejects(() => fetchDailyInspection('veh-1', '2026-10-01'))
})

test('저장: 작성자 = 로그인 사용자, 점검자 이름, 조치 기록 빈칸이면 null, 차량+날짜 덮어쓰기', async () => {
  beginSessionEpoch('driver-1', 'owner-1')
  setHydration({ status: 'ready', userId: 'driver-1', ownerKey: 'owner-1' })
  /** @type {Array<{ row: unknown, options: unknown }>} */
  const upserts = []
  handlers.daily_inspections = { upsert: (row, options) => { upserts.push({ row, options }); return { data: null, error: null } } }
  await saveDailyInspection({ vehicleId: 'veh-1', workDate: '2026-10-01', items: { tires: 'good' }, actionNote: '   ', inspectorName: '김기사' })
  assert.deepEqual(upserts[0], {
    row: { user_id: 'driver-1', vehicle_id: 'veh-1', work_date: '2026-10-01', items: { tires: 'good' }, action_note: null, inspector_name: '김기사' },
    options: { onConflict: 'vehicle_id,work_date' },
  })
})

test('로그인 안 했으면 저장하지 않고 던짐', async () => {
  handlers.daily_inspections = { upsert: () => { throw new Error('호출되면 안 됨') } }
  await assert.rejects(() => saveDailyInspection({ vehicleId: 'veh-1', workDate: '2026-10-01', items: {}, actionNote: '', inspectorName: '' }), /로그인/)
})

test('9-C-1 한 달 읽기: 그 달 첫날~끝날 범위, 날짜별 항목(형식 검사)', async () => {
  /** @type {Array<import('../testSupport/fakeSupabaseClient.js').EqFilters>} */
  const filters = []
  /** @type {import('../store/atomicPersist.js').JsonValue} */
  const rows = [{ work_date: '2026-02-03', items: { tires: 'bad', x: 'good' } }, { work_date: '2026-02-04', items: { lamps: 'good' } }]
  handlers.daily_inspections = { select: (f) => { filters.push(/** @type {import('../testSupport/fakeSupabaseClient.js').EqFilters} */ (f)); return { data: rows, error: null } } }
  const { fetchMonthDailyInspections } = await import('./dailyInspections.js')
  const byDate = await fetchMonthDailyInspections('veh-1', 2026, 1)
  assert.deepEqual(byDate, { '2026-02-03': { tires: 'bad' }, '2026-02-04': { lamps: 'good' } })
  assert.deepEqual(filters[0], { vehicle_id: 'veh-1', 'work_date>=': '2026-02-01', 'work_date<=': '2026-02-28' })
})

test('9-C-1 점검표가 1장이라도 있는지', async () => {
  const { hasAnyDailyInspection } = await import('./dailyInspections.js')
  handlers.daily_inspections = { select: () => ({ data: [{ id: 'a' }], error: null }) }
  assert.equal(await hasAnyDailyInspection('veh-1'), true)
  handlers.daily_inspections = { select: () => ({ data: [], error: null }) }
  assert.equal(await hasAnyDailyInspection('veh-1'), false)
})
