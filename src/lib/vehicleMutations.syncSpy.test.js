// 번호 변경의 scheduleCloudSync 횟수를 hasDirty 간접 신호가 아니라 mock.module로 직접 센다.
import { resetStubSupabaseCallCounts, stubSupabaseCallCounts, stubSupabaseMethodImpls } from '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

let scheduleCloudSyncCallCount = 0
mock.module('./syncQueue.js', {
  namedExports: {
    scheduleCloudSync: () => { scheduleCloudSyncCallCount += 1 },
    flushCloudSync: async () => {},
  },
})

const { commitCars, commitLogWorkData } = await import('../store/commitHelpers.js')
const { getState, subscribe, setHydration } = await import('../store/app-store.js')
const { requestVehicleSave } = await import('./vehicleMutations.js')
const { requestVehicleDeletion } = await import('./directMutationActions.js')
const { storageKeyFor, storageKeyForLog } = await import('../store/persist.js')
const { beginSessionEpoch, endCloudSession } = await import('./cloudSession.js')
const { pendingOwnerForLog } = await import('./pendingLogOwner.js')
const { registerPendingDayWrite, getPendingDayWrite } = await import('./pendingWorkDataWrites.js')
const { durableKey } = await import('./durableStorage.js')

function totalStubCalls() {
  return Object.values(stubSupabaseCallCounts).reduce((sum, n) => sum + n, 0)
}

test('번호 변경 성공은 scheduleCloudSync를 1회 부르고 persist 실패는 0회다', async () => {
  resetStubSupabaseCallCounts()
  const ownerOk = 'veh-sync-ok'
  const ownerFail = 'veh-sync-fail'
  commitCars(ownerOk, [{
    id: 'car-ok', type: 'sub', number: '81가8101', driverName: '성', driverPhone: '010-8101-8101',
  }], { syncToCloud: false })
  commitLogWorkData(ownerOk, '81가8101', { '2026-08-23': { isOff: false, fixedCount: 1 } })
  const beforeOk = scheduleCloudSyncCallCount
  const apiBefore = totalStubCalls()
  let notifyCount = 0
  const unsubOk = subscribe(() => { notifyCount += 1 })
  const ok = await requestVehicleSave({
    ownerKey: ownerOk,
    cars: getState().cars[ownerOk],
    editingId: 'car-ok',
    draft: { number: '81가8102', type: 'sub', driverName: '성', driverPhone: '010-8101-8101' },
  })
  unsubOk()
  assert.equal(ok.failed, false)
  assert.equal(notifyCount, 1)
  assert.equal(scheduleCloudSyncCallCount, beforeOk + 1)
  assert.equal(totalStubCalls(), apiBefore)

  commitCars(ownerFail, [{
    id: 'car-fail', type: 'sub', number: '82나8201', driverName: '패', driverPhone: '010-8201-8201',
  }], { syncToCloud: false })
  commitLogWorkData(ownerFail, '82나8201', { '2026-08-23': { isOff: false, fixedCount: 1 } })
  const oldPending = pendingOwnerForLog(ownerFail, '82나8201')
  registerPendingDayWrite(oldPending, '2026-08-23', {
    isOff: false, fixedCount: 4, palletCount: 0, callDetails: [], fixedRouteCounts: {},
  })
  const proto = Object.getPrototypeOf(localStorage)
  const original = proto.setItem
  const spy = mock.method(proto, 'setItem', function patched(/** @type {string} */ key, /** @type {string} */ value) {
    if (key === storageKeyForLog(ownerFail, '82나8202')) throw new Error('quota exceeded (simulated)')
    return original.call(localStorage, key, value)
  })
  const beforeFail = scheduleCloudSyncCallCount
  let failNotify = 0
  const unsubFail = subscribe(() => { failNotify += 1 })
  const originalError = console.error
  const errSpy = mock.method(console, 'error', /**
   * @param {string|Error} first
   * @param {string|Error} [second]
   */
  function patched(first, second) {
    if (second === undefined) return originalError.call(console, first)
    return originalError.call(console, first, second)
  })
  try {
    const failed = await requestVehicleSave({
      ownerKey: ownerFail,
      cars: getState().cars[ownerFail],
      editingId: 'car-fail',
      draft: { number: '82나8202', type: 'sub', driverName: '패', driverPhone: '010-8201-8201' },
    })
    assert.equal(failed.failed, true)
    assert.equal(failNotify, 0)
    assert.equal(scheduleCloudSyncCallCount, beforeFail)
    assert.equal(getPendingDayWrite(oldPending, '2026-08-23')?.fixedCount, 4)
    assert.equal(localStorage.getItem(durableKey(oldPending)) != null || getPendingDayWrite(oldPending, '2026-08-23') != null, true)
    const matched = errSpy.mock.calls.filter((call) => (
      call.arguments[0] === '[vehicleMutations] 차량 저장 실패:'
      && call.arguments[1] instanceof Error
      && call.arguments[1].message === 'quota exceeded (simulated)'
    ))
    assert.equal(matched.length, 1)
    assert.equal(errSpy.mock.callCount(), 1)
  } finally {
    unsubFail()
    spy.mock.restore()
    errSpy.mock.restore()
  }
})

test('로컬 차량 삭제는 scheduleCloudSync 1회·Supabase 0회다', async () => {
  resetStubSupabaseCallCounts()
  endCloudSession()
  const owner = 'veh-sync-local-del'
  commitCars(owner, [{ id: 'car-local', type: 'sub', number: '70가7000' }], { syncToCloud: false })
  const before = scheduleCloudSyncCallCount
  const apiBefore = { ...stubSupabaseCallCounts }
  const result = await requestVehicleDeletion({
    ownerKey: owner, userId: null, cars: getState().cars[owner], vehicleId: 'car-local',
  })
  assert.equal(result.failed, false)
  assert.equal(scheduleCloudSyncCallCount, before + 1)
  assert.equal(stubSupabaseCallCounts.delete || 0, apiBefore.delete || 0)
  assert.equal(stubSupabaseCallCounts.select || 0, apiBefore.select || 0)
  assert.equal(stubSupabaseCallCounts.upsert || 0, apiBefore.upsert || 0)
  assert.equal(stubSupabaseCallCounts.insert || 0, apiBefore.insert || 0)
  assert.equal(stubSupabaseCallCounts.update || 0, apiBefore.update || 0)
})

test('Supabase 차량 삭제 성공은 scheduleCloudSync 0회·delete 6회다', async () => {
  resetStubSupabaseCallCounts()
  beginSessionEpoch('user-sync-del', 'veh-sync-remote-del')
  setHydration({ status: 'ready', userId: 'user-sync-del', ownerKey: 'veh-sync-remote-del' })
  const owner = 'veh-sync-remote-del'
  commitCars(owner, [{ id: 'car-rem', number: '71가7100', supabaseId: 7100 }], { syncToCloud: false })
  const before = scheduleCloudSyncCallCount
  const result = await requestVehicleDeletion({
    ownerKey: owner, userId: 'user-sync-del', cars: getState().cars[owner], vehicleId: 'car-rem',
  })
  assert.equal(result.failed, false)
  assert.match(String(result.toast), /삭제했습니다/)
  assert.equal(scheduleCloudSyncCallCount, before)
  assert.equal(stubSupabaseCallCounts.delete, 6)
  assert.equal(stubSupabaseCallCounts.select || 0, 0)
  assert.equal(stubSupabaseCallCounts.upsert || 0, 0)
  assert.equal(stubSupabaseCallCounts.insert || 0, 0)
  assert.equal(stubSupabaseCallCounts.update || 0, 0)
})

test('슬라이스 C — 원격 삭제 throw는 Fail-Fast(failed:true)이고 scheduleCloudSync 0회, 자식 delete만 나간다', async () => {
  resetStubSupabaseCallCounts()
  stubSupabaseMethodImpls.delete = async () => { throw new Error('network down') }
  beginSessionEpoch('user-sync-retry', 'veh-sync-retry-del')
  setHydration({ status: 'ready', userId: 'user-sync-retry', ownerKey: 'veh-sync-retry-del' })
  const owner = 'veh-sync-retry-del'
  commitCars(owner, [{ id: 'car-r', number: '72가7200', supabaseId: 7200 }], { syncToCloud: false })
  const before = scheduleCloudSyncCallCount
  const errSpy = mock.method(console, 'error', /**
   * @param {string|Error} [_first]
   * @param {string|Error} [_second]
   */
  function patched(_first, _second) {})
  try {
    const result = await requestVehicleDeletion({
      ownerKey: owner, userId: 'user-sync-retry', cars: getState().cars[owner], vehicleId: 'car-r',
    })
    assert.equal(result.failed, true)
    assert.equal(String(result.toast), '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.')
    assert.deepEqual(getState().cars[owner].map((c) => c.id), ['car-r'], 'Store는 저장 전 값이어야 한다')
    assert.equal(scheduleCloudSyncCallCount, before)
    assert.equal(stubSupabaseCallCounts.delete, 4)
    assert.equal(stubSupabaseCallCounts.select || 0, 0)
    assert.equal(stubSupabaseCallCounts.upsert || 0, 0)
    assert.equal(stubSupabaseCallCounts.insert || 0, 0)
    assert.equal(stubSupabaseCallCounts.update || 0, 0)
    assert.equal(errSpy.mock.callCount() >= 1, true)
  } finally {
    errSpy.mock.restore()
    resetStubSupabaseCallCounts()
  }
})

test('persist/remove 실패 삭제는 scheduleCloudSync 0회·Supabase 0회다', async () => {
  resetStubSupabaseCallCounts()
  endCloudSession()
  const owner = 'veh-sync-persist-fail'
  commitCars(owner, [{ id: 'car-p', type: 'sub', number: '73가7300' }], { syncToCloud: false })
  const proto = Object.getPrototypeOf(localStorage)
  const originalSet = proto.setItem
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patched(key, value) {
    if (key === storageKeyFor('cars', owner)) throw new Error('quota exceeded (simulated)')
    return originalSet.call(localStorage, key, value)
  })
  const before = scheduleCloudSyncCallCount
  const originalError = console.error
  const errSpy = mock.method(console, 'error', /**
   * @param {string|Error} first
   * @param {string|Error} [second]
   */
  function patchedErr(first, second) {
    if (second === undefined) return originalError.call(console, first)
    return originalError.call(console, first, second)
  })
  try {
    const result = await requestVehicleDeletion({
      ownerKey: owner, userId: null, cars: getState().cars[owner], vehicleId: 'car-p',
    })
    assert.equal(result.failed, true)
    assert.equal(scheduleCloudSyncCallCount, before)
    assert.equal(stubSupabaseCallCounts.delete || 0, 0)
    assert.equal(stubSupabaseCallCounts.select || 0, 0)
    assert.equal(stubSupabaseCallCounts.upsert || 0, 0)
    assert.equal(stubSupabaseCallCounts.insert || 0, 0)
    assert.equal(stubSupabaseCallCounts.update || 0, 0)
  } finally {
    spy.mock.restore()
    errSpy.mock.restore()
  }

  commitLogWorkData(owner, '73가7300', { '2026-08-01': { isOff: false, fixedCount: 1 } })
  const originalRemove = proto.removeItem
  const removeSpy = mock.method(proto, 'removeItem', /** @this {Storage} @param {string} key */ function patchedRemove(key) {
    if (key === storageKeyForLog(owner, '73가7300')) throw new Error('quota exceeded (simulated)')
    return originalRemove.call(localStorage, key)
  })
  const beforeRemove = scheduleCloudSyncCallCount
  const errSpy2 = mock.method(console, 'error', /**
   * @param {string|Error} first
   * @param {string|Error} [second]
   */
  function patchedErr2(first, second) {
    if (second === undefined) return originalError.call(console, first)
    return originalError.call(console, first, second)
  })
  try {
    const removed = await requestVehicleDeletion({
      ownerKey: owner, userId: null, cars: getState().cars[owner], vehicleId: 'car-p',
    })
    assert.equal(removed.failed, true)
    assert.equal(scheduleCloudSyncCallCount, beforeRemove)
    assert.equal(stubSupabaseCallCounts.delete || 0, 0)
    assert.equal(stubSupabaseCallCounts.select || 0, 0)
    assert.equal(stubSupabaseCallCounts.upsert || 0, 0)
    assert.equal(stubSupabaseCallCounts.insert || 0, 0)
    assert.equal(stubSupabaseCallCounts.update || 0, 0)
  } finally {
    removeSpy.mock.restore()
    errSpy2.mock.restore()
  }
})
