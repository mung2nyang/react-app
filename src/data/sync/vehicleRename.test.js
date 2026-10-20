// 로드맵 66 — 기사 차량 번호를 바꾸면 지출·전용 거래처·기사 연결·차량 설정도 새 번호로 옮긴다.
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf, emptyOkHandlers } = createFakeSupabase()
mock.module('../cloud/supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { requestVehicleSave } = await import('./vehicleMutations.js')
const { saveExpenses } = await import('../../lib/expenses.js')
const { beginSessionEpoch, endCloudSession } = await import('../cloud/cloudSession.js')
const { getState, setHydration } = await import('../store/app-store.js')
const { commitCars, commitClients, commitDrivers, commitExpenses, commitSettings } = await import('../store/commitHelpers.js')
const { readJsonKey } = await import('../store/persist.js')

const OLD = '99가9999'
const NEW = '99가9998'
const FAIL_FAST = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'

/** @param {string} owner */
function seed(owner) {
  commitCars(owner, [
    { id: 'car-main', type: 'main', number: '11가1111', supabaseId: 'v-main' },
    { id: 'car-sub', type: 'sub', number: OLD, supabaseId: 'v-sub', driverName: '김', driverPhone: '010-1111-2222' },
  ])
  commitExpenses(owner, [
    { id: 'e-sub', kind: 'fuel', date: '2026-10-10', cost: 50000, vehicleNumber: OLD },
    { id: 'e-main', kind: 'fuel', date: '2026-10-10', cost: 70000 },
  ])
  commitClients(owner, [
    { id: 'c-sub', companyName: '전용', scopedToVehicleNumber: OLD, fixedRouteLinked: true, fixedUnitPrice: '30000' },
    { id: 'c-all', companyName: '공용' },
  ])
  commitDrivers(owner, [
    { id: 'd1', name: '김', phone: '010-1111-2222', inviteCode: 'ABCDE12345', vehicleNumber: OLD, startDate: '2026-10-01', endDate: '', status: 'pending' },
  ])
  commitSettings(owner, { theme: 'light', subCarSettings: { [OLD]: { inputMode: 'count', callDetail: true, timeOn: false, platformOn: false, distanceOn: false, cargoTonnageOn: false, dailyInspectionOn: true } } })
}

/** @param {string} owner */
function rename(owner) {
  return requestVehicleSave({
    ownerKey: owner,
    cars: getState().cars[owner],
    editingId: 'car-sub',
    draft: { number: NEW, type: 'sub', driverName: '김', driverPhone: '010-1111-2222' },
  })
}

/** @param {string} owner @param {string} plate */
function assertAllTagged(owner, plate) {
  const state = getState()
  assert.equal(state.cars[owner].find((car) => car.id === 'car-sub')?.number, plate)
  assert.equal(state.expenses[owner].find((item) => item.id === 'e-sub')?.vehicleNumber, plate)
  assert.equal(state.expenses[owner].find((item) => item.id === 'e-main')?.vehicleNumber, undefined)
  assert.equal(state.clients[owner].find((item) => item.id === 'c-sub')?.scopedToVehicleNumber, plate)
  assert.equal(state.drivers[owner][0]?.vehicleNumber, plate)
  assert.ok(state.settings[owner]?.subCarSettings?.[plate]?.dailyInspectionOn)
  const other = plate === NEW ? OLD : NEW
  assert.equal(state.settings[owner]?.subCarSettings?.[other], undefined)
}

/** @param {string} owner */
function beginLoggedIn(owner) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  beginSessionEpoch(owner, owner)
  setHydration({ status: 'ready', userId: owner, ownerKey: owner })
}

describe('66 기사 차량 번호 변경 — 묶인 것 옮기기', () => {
  test('R-1 비회원: 지출·전용 거래처·기사 연결·차량 설정이 새 번호로, 기기 저장소에도', async () => {
    resetHandlers()
    endCloudSession()
    const owner = 'guest-r1'
    seed(owner)
    const result = await rename(owner)
    assert.equal(result.failed, false)
    assertAllTagged(owner, NEW)
    const storedClients = /** @type {Array<{ id: string, scopedToVehicleNumber?: string }>} */ (readJsonKey('clients', owner, []))
    assert.equal(storedClients.find((item) => item.id === 'c-sub')?.scopedToVehicleNumber, NEW)
    const storedSettings = /** @type {{ subCarSettings?: Record<string, { dailyInspectionOn?: boolean }> }} */ (readJsonKey('settings', owner, {}))
    assert.ok(storedSettings.subCarSettings?.[NEW]?.dailyInspectionOn)
  })

  test('R-2 로그인: 서버 함수 1회 → 차량 저장 1회 → 화면 전부 새 번호', async () => {
    const owner = 'own-r2'
    beginLoggedIn(owner)
    /** @type {Array<import('../store/atomicPersist.js').JsonValue>} */
    const rpcArgs = []
    handlers.rpc = { rename_sub_vehicle: (args) => { rpcArgs.push(args ?? null); return { data: [{ old_number: OLD, new_number: NEW, clients_updated: 1 }], error: null } } }
    seed(owner)
    const result = await rename(owner)
    assert.equal(result.failed, false)
    assert.deepEqual(rpcArgs, [{ p_vehicle_id: 'v-sub', p_new_number: NEW }])
    assert.equal(countOf('vehicles', 'update'), 1)
    assertAllTagged(owner, NEW)
    endCloudSession()
  })

  test('R-3 로그인: 서버 함수가 거절하면 차량 저장 0회, 화면 옛 번호 그대로, 서버 문구 안내', async () => {
    const owner = 'own-r3'
    beginLoggedIn(owner)
    handlers.rpc = { rename_sub_vehicle: () => ({ data: null, error: { code: 'P0001', message: '이미 등록된 차량번호입니다.' } }) }
    seed(owner)
    const spy = mock.method(console, 'error', () => {})
    const result = await rename(owner)
    assert.equal(spy.mock.callCount(), 1)
    spy.mock.restore()
    assert.equal(result.failed, true)
    assert.equal(result.toast, '이미 등록된 차량번호입니다.')
    assert.equal(countOf('vehicles', 'update'), 0)
    assertAllTagged(owner, OLD)
    endCloudSession()
  })

  test('R-3b 로그인: 함수 성공·차량 저장 실패면 화면 옛 번호, 다시 저장하면 새 번호', async () => {
    const owner = 'own-r3b'
    beginLoggedIn(owner)
    let rpcCount = 0
    handlers.rpc = { rename_sub_vehicle: () => { rpcCount += 1; return { data: [], error: null } } }
    handlers.vehicles = { ...handlers.vehicles, update: () => { throw new Error('network down') } }
    seed(owner)
    const spy = mock.method(console, 'error', () => {})
    const failed = await rename(owner)
    assert.equal(spy.mock.callCount(), 1)
    spy.mock.restore()
    assert.equal(failed.failed, true)
    assert.equal(failed.toast, FAIL_FAST)
    assertAllTagged(owner, OLD)
    handlers.vehicles = { ...handlers.vehicles, update: () => ({ data: null, error: null }) }
    const retried = await rename(owner)
    assert.equal(retried.failed, false)
    assert.equal(rpcCount, 2)
    assertAllTagged(owner, NEW)
    endCloudSession()
  })

  test('R-4 로그인: 번호를 안 바꾸면 서버 함수 0회', async () => {
    const owner = 'own-r4'
    beginLoggedIn(owner)
    seed(owner)
    const result = await requestVehicleSave({
      ownerKey: owner,
      cars: getState().cars[owner],
      editingId: 'car-sub',
      draft: { number: OLD, type: 'sub', tonnage: '5톤', driverName: '김', driverPhone: '010-1111-2222' },
    })
    assert.equal(result.failed, false)
    assert.equal(countOf('rpc', 'rename_sub_vehicle'), 0)
    assertAllTagged(owner, OLD)
    endCloudSession()
  })

  test('R-5 로그인: 번호를 바꾼 뒤 지출을 저장해도 그 차량 칸으로 간다(메인 칸 0건)', async () => {
    const owner = 'own-r5'
    beginLoggedIn(owner)
    handlers.rpc = { rename_sub_vehicle: () => ({ data: [], error: null }) }
    /** @type {Array<import('../store/atomicPersist.js').JsonValue>} */
    const fuelRows = []
    handlers.daily_logs = { select: () => ({ data: [], error: null }), upsert: () => ({ data: { id: 'dl-1' }, error: null }) }
    handlers.fuel_records = { insert: (rows) => { fuelRows.push(...(Array.isArray(rows) ? rows : [rows ?? null])); return { data: null, error: null } } }
    seed(owner)
    assert.equal((await rename(owner)).failed, false)
    await saveExpenses(owner, getState().expenses[owner])
    const vehicleIds = fuelRows.map((row) => /** @type {{ vehicle_id?: string }} */ (row ?? {}).vehicle_id)
    assert.ok(vehicleIds.includes('v-sub'), '바뀐 번호 차량 지출은 그 차량 칸으로')
    assert.equal(vehicleIds.filter((id) => id === 'v-main').length, 1, '메인 칸엔 메인 지출 1건만')
    endCloudSession()
  })
})
