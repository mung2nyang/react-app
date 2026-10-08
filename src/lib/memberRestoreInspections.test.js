// @ts-check
// 회원 데이터 불러오기(22-C): 서버에 있는 날은 저장 0회, 없는 날만 파일 그대로(점검자 이름 포함) 저장, 연동·없는 차량은 건너뜀.
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

const cars = [
  { id: 'c-main', type: 'main', number: '12가3456', supabaseId: 'v-main' },
  { id: 'c-sub', type: 'sub', number: '34나5678', supabaseId: 'v-sub' },
  { id: 'c-linked', type: 'sub', number: '56다7890', supabaseId: 'v-linked' },
]
const drivers = [{ id: 'd-1', status: 'linked', vehicleNumber: '56다7890' }]
/** @type {Record<string, Record<string, object>>} */
let onServer = {}
let fetchFails = false
/** @type {Array<Array<string|number>>} */
const fetched = []
/** @type {Array<Record<string, unknown>>} */
const saved = []
let failOnSave = 0

mock.module('../store/ownerDataHooks.js', {
  namedExports: { readOwnerCars: () => cars, readOwnerDrivers: () => drivers },
})
mock.module('./memberRestoreRecords.js', {
  namedExports: {
    isOwnUnlinkedCar: (/** @type {string} */ _owner, /** @type {string} */ plate) => plate === 'main' || plate === '34나5678',
  },
})
mock.module('./dailyInspections.js', {
  namedExports: {
    fetchVehiclesDailyInspections: async (/** @type {Array<string|number>} */ ids) => {
      fetched.push(ids)
      if (fetchFails) throw new Error('network')
      return onServer
    },
    saveDailyInspection: async (/** @type {Record<string, unknown>} */ input) => {
      if (failOnSave && saved.length + 1 === failOnSave) throw new Error('network')
      saved.push(input)
    },
  },
})

const { pickInspections, restoreInspections } = await import('./memberRestoreInspections.js')

/** @param {string} name */
const sheet = (name) => ({ items: { plateGlassMirror: 'good', lamps: 'bad', wipers: 'weird' }, actionNote: '전조등 교체', inspectorName: name })

function reset() {
  onServer = { 'v-main': { '2026-10-01': sheet('지금이름') } }
  fetchFails = false
  fetched.length = 0
  saved.length = 0
  failOnSave = 0
}

const FILE = { dailyInspections: {
  main: { '2026-10-01': sheet('옛이름'), '2026-10-02': sheet('옛이름') },
  '34나5678': { '2026-10-03': sheet('김기사') },
  '56다7890': { '2026-10-04': sheet('연동기사') },
  '99마9999': { '2026-10-05': sheet('없는차') },
} }

test('서버에 있는 날은 고르지 않고, 없는 날만 내 차량·미연동 차량에서 고른다(연동·없는 차량은 건너뛴 수)', async () => {
  reset()
  const res = await pickInspections('o-1', FILE)
  assert.ok(res.ok)
  assert.deepEqual(res.picks.map((pick) => [pick.vehicleId, pick.workDate]), [['v-main', '2026-10-02'], ['v-sub', '2026-10-03']])
  assert.equal(res.skipped, 2)
  assert.deepEqual(fetched, [['v-main', 'v-sub']], '서버 읽기는 한 번에')
})

test('점검자 이름·조치 기록은 파일 그대로, 점검 항목은 good/bad만 남긴다', async () => {
  reset()
  const res = await pickInspections('o-1', FILE)
  assert.ok(res.ok)
  assert.deepEqual(res.picks[0], {
    vehicleId: 'v-main', workDate: '2026-10-02', items: { plateGlassMirror: 'good', lamps: 'bad' }, actionNote: '전조등 교체', inspectorName: '옛이름',
  })
})

test('모양이 틀리면 올바르지 않음 — 서버 읽기·저장 0회', async () => {
  reset()
  for (const bad of [
    { dailyInspections: [] },
    { dailyInspections: { main: [] } },
    { dailyInspections: { main: { '2026-02-30': sheet('a') } } },
    { dailyInspections: { main: { '2026-10-01': { items: {}, actionNote: '', inspectorName: 3 } } } },
    { dailyInspections: { main: { '2026-10-01': { actionNote: '', inspectorName: 'a' } } } },
  ]) {
    const res = await pickInspections('o-1', /** @type {never} */ (bad))
    assert.equal(res.ok, false, JSON.stringify(bad))
  }
  assert.equal(fetched.length, 0)
})

test('점검표 칸이 없거나 넣을 차량이 없으면 서버를 읽지 않는다', async () => {
  reset()
  assert.deepEqual(await pickInspections('o-1', { workLogs: {} }), { ok: true, picks: [], skipped: 0 })
  assert.deepEqual(await pickInspections('o-1', { dailyInspections: { '56다7890': { '2026-10-04': sheet('a') } } }), { ok: true, picks: [], skipped: 1 })
  assert.equal(fetched.length, 0)
})

test('서버 읽기가 실패하면 고르지 않고 안내만', async () => {
  reset()
  fetchFails = true
  const res = await pickInspections('o-1', FILE)
  assert.equal(res.ok, false)
  assert.match(res.ok ? '' : res.error, /점검표를 확인하지 못했습니다/)
})

test('저장: 날짜마다 저장, 중간 실패면 멈추고 성공 수와 안내를 돌려준다', async () => {
  reset()
  const res = await pickInspections('o-1', FILE)
  assert.ok(res.ok)
  assert.deepEqual(await restoreInspections(res.picks), { ok: true, count: 2, toast: null })
  saved.length = 0
  failOnSave = 1
  const failed = await restoreInspections(res.picks)
  assert.equal(failed.ok, false)
  assert.equal(failed.count, 0)
  assert.equal(saved.length, 0, '실패 뒤 다음 날짜 0회')
  assert.match(String(failed.toast), /저장에 실패/)
})
