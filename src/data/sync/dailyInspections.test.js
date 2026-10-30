// @ts-check
// 로드맵 9-B-2 — 일상점검표 서버 읽기·저장: 차량+날짜 1장, 덮어쓰기, 작성자·점검자 이름, 서버 값 형식 검사.
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'
import { createFakeSupabase } from '../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers } = createFakeSupabase()
mock.module('../cloud/supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

const { fetchDailyInspection, saveDailyInspection } = await import('./dailyInspections.ts')
const { beginSessionEpoch, endCloudSession } = await import('../cloud/cloudSession.ts')
const { setHydration } = await import('../store/app-store.ts')

beforeEach(() => { resetHandlers(); endCloudSession() })

test('읽기: 차량·날짜로 1장, 형식 검사 후 돌려줌 / 없으면 null', async () => {
  /** @type {Array<import('../../testSupport/fakeSupabaseClient.js').EqFilters>} */
  const filters = []
  handlers.daily_inspections = { select: (f) => { filters.push(/** @type {import('../../testSupport/fakeSupabaseClient.js').EqFilters} */ (f)); return { data: { items: { tires: 'bad', bogus: 'good' }, action_note: '타이어 교체 예정', inspector_name: '김기사' }, error: null } } }
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

test('9-C-1 한 달 읽기: 그 달 첫날~끝날 범위, 날짜별 항목(형식 검사)·점검자·조치 기록(9-D)', async () => {
  /** @type {Array<import('../../testSupport/fakeSupabaseClient.js').EqFilters>} */
  const filters = []
  /** @type {import('../store/atomicPersist.ts').JsonValue} */
  const rows = [{ work_date: '2026-02-03', items: { tires: 'bad', x: 'good' }, action_note: '타이어 교체', inspector_name: '김기사' }, { work_date: '2026-02-04', items: { lamps: 'good' }, action_note: null, inspector_name: null }]
  handlers.daily_inspections = { select: (f) => { filters.push(/** @type {import('../../testSupport/fakeSupabaseClient.js').EqFilters} */ (f)); return { data: rows, error: null } } }
  const { fetchMonthDailyInspections } = await import('./dailyInspections.ts')
  const byDate = await fetchMonthDailyInspections('veh-1', 2026, 1)
  assert.deepEqual(byDate, {
    '2026-02-03': { items: { tires: 'bad' }, actionNote: '타이어 교체', inspectorName: '김기사' },
    '2026-02-04': { items: { lamps: 'good' }, actionNote: '', inspectorName: '' },
  })
  assert.deepEqual(filters[0], { vehicle_id: 'veh-1', 'work_date>=': '2026-02-01', 'work_date<=': '2026-02-28' })
})

test('9-C-1 점검표가 1장이라도 있는지', async () => {
  const { hasAnyDailyInspection } = await import('./dailyInspections.ts')
  handlers.daily_inspections = { select: () => ({ data: [{ id: 'a' }], error: null }) }
  assert.equal(await hasAnyDailyInspection('veh-1'), true)
  handlers.daily_inspections = { select: () => ({ data: [], error: null }) }
  assert.equal(await hasAnyDailyInspection('veh-1'), false)
})

// 로드맵 112 — 지우기: 차량+날짜 1장, 저장과 같은 막기, 권한이 막아 0줄이면 실패.
test('지우기: 차량·날짜로 지우고 지운 줄을 받는다', async () => {
  beginSessionEpoch('driver-1', 'owner-1')
  setHydration({ status: 'ready', userId: 'driver-1', ownerKey: 'owner-1' })
  const { deleteDailyInspection } = await import('./dailyInspections.ts')
  /** @type {Array<import('../../testSupport/fakeSupabaseClient.js').EqFilters>} */
  const filters = []
  handlers.daily_inspections = { delete: (f) => { filters.push(/** @type {import('../../testSupport/fakeSupabaseClient.js').EqFilters} */ (f)); return { data: [{ id: 'a' }], error: null } } }
  await deleteDailyInspection({ vehicleId: 'veh-1', workDate: '2026-10-25' })
  assert.deepEqual(filters, [{ vehicle_id: 'veh-1', work_date: '2026-10-25' }])
})

test('지우기 실패: 서버 오류는 던지고, 0줄(권한 없음·이미 없음)은 "지우지 못했습니다"로 던진다', async () => {
  beginSessionEpoch('driver-1', 'owner-1')
  setHydration({ status: 'ready', userId: 'driver-1', ownerKey: 'owner-1' })
  const { deleteDailyInspection, DELETE_FAIL } = await import('./dailyInspections.ts')
  const input = { vehicleId: 'veh-1', workDate: '2026-10-25' }
  handlers.daily_inspections = { delete: () => ({ data: null, error: { message: 'down' } }) }
  await assert.rejects(() => deleteDailyInspection(input), (error) => error instanceof Error ? true : (/** @type {{ message?: string }} */ (error)).message === 'down')
  handlers.daily_inspections = { delete: () => ({ data: [], error: null }) }
  await assert.rejects(() => deleteDailyInspection(input), new RegExp(DELETE_FAIL))
  handlers.daily_inspections = { delete: () => ({ data: null, error: null }) }
  await assert.rejects(() => deleteDailyInspection(input), new RegExp(DELETE_FAIL), '줄 정보가 없어도 실패')
  assert.equal(DELETE_FAIL, '일상점검표를 지우지 못했습니다.')
})

test('지우기 막기: 로그인 안 함·서버 값 받는 중이면 서버를 부르지 않고 던진다, 지우는 사이 계정이 바뀌면 던진다', async () => {
  const { deleteDailyInspection } = await import('./dailyInspections.ts')
  const input = { vehicleId: 'veh-1', workDate: '2026-10-25' }
  let deletes = 0
  handlers.daily_inspections = { delete: () => { deletes += 1; return { data: [{ id: 'a' }], error: null } } }
  await assert.rejects(() => deleteDailyInspection(input), /로그인/)
  beginSessionEpoch('driver-1', 'owner-1')
  setHydration({ status: 'hydrating', userId: 'driver-1', ownerKey: 'owner-1' })
  await assert.rejects(() => deleteDailyInspection(input))
  assert.equal(deletes, 0)
  setHydration({ status: 'ready', userId: 'driver-1', ownerKey: 'owner-1' })
  handlers.daily_inspections = { delete: () => { endCloudSession(); return { data: [{ id: 'a' }], error: null } } }
  await assert.rejects(() => deleteDailyInspection(input))
})

test('저장·지우기 성공 뒤에만 알림: 저장은 "있음", 지우기는 "없음", 실패·막힘은 알림 없음', async () => {
  const { deleteDailyInspection } = await import('./dailyInspections.ts')
  const { subscribeDailyInspectionChanges } = await import('./dailyInspectionChanges.ts')
  /** @type {Array<import('./dailyInspectionChanges.ts').DailyInspectionChange>} */
  const changes = []
  const unsubscribe = subscribeDailyInspectionChanges((change) => { changes.push(change) })
  try {
    const save = { vehicleId: 'veh-1', workDate: '2026-10-30', items: {}, actionNote: '', inspectorName: '' }
    const remove = { vehicleId: 'veh-1', workDate: '2026-10-30' }
    await assert.rejects(() => saveDailyInspection(save), /로그인/)
    beginSessionEpoch('driver-1', 'owner-1')
    setHydration({ status: 'ready', userId: 'driver-1', ownerKey: 'owner-1' })
    handlers.daily_inspections = { upsert: () => ({ data: null, error: { message: 'down' } }), delete: () => ({ data: [], error: null }) }
    await assert.rejects(() => saveDailyInspection(save))
    await assert.rejects(() => deleteDailyInspection(remove))
    assert.deepEqual(changes, [], '실패하면 알림 없음')
    handlers.daily_inspections = { upsert: () => ({ data: null, error: null }), delete: () => ({ data: [{ id: 'a' }], error: null }) }
    await saveDailyInspection(save)
    await deleteDailyInspection(remove)
    assert.deepEqual(changes, [{ vehicleId: 'veh-1', workDate: '2026-10-30', saved: true }, { vehicleId: 'veh-1', workDate: '2026-10-30', saved: false }])
  } finally {
    unsubscribe()
  }
})
