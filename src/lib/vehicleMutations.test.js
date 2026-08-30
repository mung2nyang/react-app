import { resetStubSupabaseCallCounts, stubSupabaseCallCounts } from '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'

const { commitCars, commitClients, commitLogWorkData } = await import('../store/commitHelpers.js')
const { getState, setHydration, subscribe } = await import('../store/app-store.js')
const { requestVehicleSave } = await import('./vehicleMutations.js')
const { requestClientSave, requestClientReorder, requestClientFixedUnitPrice, requestClientTaxInfo } = await import('./clientMutations.js')
const { requestVehicleDeletion } = await import('./directMutationActions.js')
const { readJsonKey, readLogWorkData, storageKeyFor, storageKeyForLog } = await import('../store/persist.js')
const { beginSessionEpoch } = await import('./cloudSession.js')
const { hasDirty } = await import('./dirtyJournal.js')
const { pendingOwnerForLog } = await import('./pendingLogOwner.js')
const { registerPendingDayWrite, retryPendingDayWrites, getPendingDayWrite, pendingDayWriteCount } = await import('./pendingWorkDataWrites.js')
const { durableKey } = await import('./durableStorage.js')
const {
  getUnsafeRegistrationPatch,
  hasUnsafeRegistration,
  markUnsafeRegistrationFailure,
} = await import('./durableWriteGuard.js')

function totalStubCalls() {
  return Object.values(stubSupabaseCallCounts).reduce((sum, n) => sum + n, 0)
}

/** @param {string} expectedFirst */
function spyQuotaConsole(expectedFirst) {
  const original = console.error
  const spy = mock.method(console, 'error', /**
   * @param {string|Error} first
   * @param {string|Error} [second]
   */
  function patched(first, second) {
    if (second === undefined) return original.call(console, first)
    return original.call(console, first, second)
  })
  return {
    assertOnce() {
      const matched = spy.mock.calls.filter((call) => {
        const args = call.arguments
        return args[0] === expectedFirst && args[1] instanceof Error && args[1].message === 'quota exceeded (simulated)'
      })
      assert.equal(matched.length, 1)
      assert.equal(spy.mock.callCount(), 1)
    },
    restore() { spy.mock.restore() },
  }
}

/** @returns {{ isOff: false, fixedCount: number, palletCount: number, callDetails: [], fixedRouteCounts: Record<string, never> }} */
function patch(fixedCount) {
  return { isOff: false, fixedCount, palletCount: 0, callDetails: [], fixedRouteCounts: {} }
}

describe('requestVehicleSave — 서브 로그 키 이동', () => {
  test('번호 변경 시 옛 키는 사라지고 새 키만 남는다', () => {
    const owner = 'veh-rename-ok'
    const oldNum = '11가1111'
    const newNum = '22나2222'
    commitCars(owner, [{
      id: 'car-sub-1', type: 'sub', number: oldNum, driverName: '김', driverPhone: '010-1111-1111', supabaseId: 'v1',
    }], { syncToCloud: false })
    commitLogWorkData(owner, oldNum, { '2026-08-10': { isOff: false, fixedCount: 4 } })
    const result = requestVehicleSave({
      ownerKey: owner,
      cars: getState().cars[owner],
      editingId: 'car-sub-1',
      draft: { number: newNum, type: 'sub', driverName: '김', driverPhone: '010-1111-1111' },
    })
    assert.equal(result.failed, false)
    assert.equal(getState().cars[owner][0].number, newNum)
    assert.equal(getState().cars[owner][0].supabaseId, 'v1')
    assert.equal(getState().workLogs[owner][oldNum], undefined)
    assert.equal(getState().workLogs[owner][newNum]['2026-08-10'].fixedCount, 4)
    assert.equal(localStorage.getItem(storageKeyForLog(owner, oldNum)), null)
    const logRead = readLogWorkData(owner, newNum)
    assert.equal(logRead.ok, true)
    assert.equal(logRead.value['2026-08-10'].fixedCount, 4)
  })

  test('번호 변경 persist 실패 시 cars/workLogs/localStorage가 전부 롤백된다', () => {
    const owner = 'veh-rename-fail'
    const oldNum = '33다3333'
    const newNum = '44라4444'
    commitCars(owner, [{
      id: 'car-sub-2', type: 'sub', number: oldNum, driverName: '박', driverPhone: '010-2222-2222',
    }], { syncToCloud: false })
    commitLogWorkData(owner, oldNum, { '2026-08-11': { isOff: false, fixedCount: 2 } })
    const proto = Object.getPrototypeOf(localStorage)
    const original = proto.setItem
    const failKey = storageKeyForLog(owner, newNum)
    const spy = mock.method(proto, 'setItem', function patched(/** @type {string} */ key, /** @type {string} */ value) {
      if (key === failKey) throw new Error('quota exceeded (simulated)')
      return original.call(localStorage, key, value)
    })
    const errSpy = spyQuotaConsole('[vehicleMutations] 차량 저장 실패:')
    try {
      const result = requestVehicleSave({
        ownerKey: owner,
        cars: getState().cars[owner],
        editingId: 'car-sub-2',
        draft: { number: newNum, type: 'sub', driverName: '박', driverPhone: '010-2222-2222' },
      })
      assert.equal(result.failed, true)
      errSpy.assertOnce()
      assert.equal(getState().cars[owner][0].number, oldNum)
      assert.equal(getState().workLogs[owner][oldNum]['2026-08-11'].fixedCount, 2)
      assert.equal(getState().workLogs[owner][newNum], undefined)
      const oldRead = readLogWorkData(owner, oldNum)
      assert.equal(oldRead.ok, true)
      assert.equal(oldRead.value['2026-08-11'].fixedCount, 2)
      assert.equal(localStorage.getItem(failKey), null)
    } finally {
      errSpy.restore()
      spy.mock.restore()
    }
  })

  test('중간 setItem 실패와 removeItem 실패 모두 원문을 롤백한다', () => {
    const owner = 'veh-rename-remove-fail'
    const oldNum = '55마5555'
    const newNum = '66바6666'
    commitCars(owner, [{
      id: 'car-sub-rm', type: 'sub', number: oldNum, driverName: '최', driverPhone: '010-5555-6666',
    }], { syncToCloud: false })
    commitLogWorkData(owner, oldNum, { '2026-08-12': { isOff: false, fixedCount: 5 } })
    const carsRaw = localStorage.getItem(storageKeyFor('cars', owner))
    const logRaw = localStorage.getItem(storageKeyForLog(owner, oldNum))
    const journalRaw = localStorage.getItem(`reactPracticeDirtyJournal:${owner}`)
    const proto = Object.getPrototypeOf(localStorage)
    const originalRemove = proto.removeItem
    const spy = mock.method(proto, 'removeItem', function patched(/** @type {string} */ key) {
      if (key === storageKeyForLog(owner, oldNum)) throw new Error('quota exceeded (simulated)')
      return originalRemove.call(localStorage, key)
    })
    const errSpy = spyQuotaConsole('[vehicleMutations] 차량 저장 실패:')
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    const apiBefore = totalStubCalls()
    try {
      const result = requestVehicleSave({
        ownerKey: owner,
        cars: getState().cars[owner],
        editingId: 'car-sub-rm',
        draft: { number: newNum, type: 'sub', driverName: '최', driverPhone: '010-5555-6666' },
      })
      assert.equal(result.failed, true)
      errSpy.assertOnce()
      assert.equal(notifyCount, 0)
      assert.equal(totalStubCalls(), apiBefore)
      assert.equal(getState().cars[owner][0].number, oldNum)
      assert.equal(localStorage.getItem(storageKeyFor('cars', owner)), carsRaw)
      assert.equal(localStorage.getItem(storageKeyForLog(owner, oldNum)), logRaw)
      assert.equal(localStorage.getItem(`reactPracticeDirtyJournal:${owner}`), journalRaw)
    } finally {
      unsubscribe()
      errSpy.restore()
      spy.mock.restore()
    }
  })
})

describe('readLogWorkData 실패 시 번호 변경은 불변', () => {
  /** @param {'getItem'|'parse'|'schema'} kind */
  function runReadFail(kind) {
    const owner = `veh-read-${kind}`
    const oldNum = '77사7777'
    const newNum = '88아8888'
    commitCars(owner, [{
      id: 'car-read-fail', type: 'sub', number: oldNum, driverName: '정', driverPhone: '010-7777-8888',
    }], { syncToCloud: false })
    commitLogWorkData(owner, oldNum, { '2026-08-13': { isOff: false, fixedCount: 1 } })
    const carsSnap = JSON.stringify(getState().cars[owner])
    const logsSnap = JSON.stringify(getState().workLogs[owner])
    const carsRaw = localStorage.getItem(storageKeyFor('cars', owner))
    const logRaw = localStorage.getItem(storageKeyForLog(owner, oldNum))
    const journalRaw = localStorage.getItem(`reactPracticeDirtyJournal:${owner}`)
    const proto = Object.getPrototypeOf(localStorage)
    const originalGet = proto.getItem
    /** @type {ReturnType<typeof mock.method>|null} */
    let getSpy = null
    if (kind === 'getItem') {
      getSpy = mock.method(proto, 'getItem', function patched(/** @type {string} */ key) {
        if (key === storageKeyForLog(owner, oldNum)) throw new Error('getItem boom')
        return originalGet.call(localStorage, key)
      })
    } else if (kind === 'parse') {
      localStorage.setItem(storageKeyForLog(owner, oldNum), '{not json')
    } else {
      localStorage.setItem(storageKeyForLog(owner, oldNum), '[]')
    }
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    const apiBefore = totalStubCalls()
    const dirtyBefore = hasDirty(owner)
    try {
      const result = requestVehicleSave({
        ownerKey: owner,
        cars: getState().cars[owner],
        editingId: 'car-read-fail',
        draft: { number: newNum, type: 'sub', driverName: '정', driverPhone: '010-7777-8888' },
      })
      assert.equal(result.failed, true)
      assert.equal(notifyCount, 0)
      assert.equal(totalStubCalls(), apiBefore)
      assert.equal(hasDirty(owner), dirtyBefore)
      assert.equal(JSON.stringify(getState().cars[owner]), carsSnap)
      assert.equal(JSON.stringify(getState().workLogs[owner]), logsSnap)
      assert.equal(localStorage.getItem(storageKeyFor('cars', owner)), carsRaw)
      if (kind === 'getItem') {
        getSpy?.mock.restore()
        assert.equal(localStorage.getItem(storageKeyForLog(owner, oldNum)), logRaw)
      }
      assert.equal(localStorage.getItem(`reactPracticeDirtyJournal:${owner}`), journalRaw)
    } finally {
      unsubscribe()
      getSpy?.mock.restore()
    }
  }

  test('getItem 예외', () => { runReadFail('getItem') })
  test('JSON.parse 실패', () => { runReadFail('parse') })
  test('스키마 불일치', () => { runReadFail('schema') })
  test('잘못된 날짜·fixedCount·callDetails는 번호 변경을 막는다', () => {
    /** @param {string} label @param {string} raw */
    function assertBlocked(label, raw) {
      const owner = `veh-nested-${label}`
      const oldNum = '77사7777'
      commitCars(owner, [{
        id: 'car-nested', type: 'sub', number: oldNum, driverName: '정', driverPhone: '010-7777-8888',
      }], { syncToCloud: false })
      commitLogWorkData(owner, oldNum, { '2026-08-13': patch(1) })
      localStorage.setItem(storageKeyForLog(owner, oldNum), raw)
      const carsSnap = JSON.stringify(getState().cars[owner])
      const logsSnap = JSON.stringify(getState().workLogs[owner])
      const queueRaw = localStorage.getItem(durableKey(pendingOwnerForLog(owner, oldNum)))
      let notifyCount = 0
      const unsub = subscribe(() => { notifyCount += 1 })
      const result = requestVehicleSave({
        ownerKey: owner,
        cars: getState().cars[owner],
        editingId: 'car-nested',
        draft: { number: '88아8888', type: 'sub', driverName: '정', driverPhone: '010-7777-8888' },
      })
      unsub()
      assert.equal(result.failed, true, label)
      assert.equal(notifyCount, 0, label)
      assert.equal(JSON.stringify(getState().cars[owner]), carsSnap, label)
      assert.equal(JSON.stringify(getState().workLogs[owner]), logsSnap, label)
      assert.equal(localStorage.getItem(durableKey(pendingOwnerForLog(owner, oldNum))), queueRaw, label)
    }
    assertBlocked('bad-date', JSON.stringify({ '2026-02-30': patch(1) }))
    assertBlocked('count-str', JSON.stringify({ '2026-08-13': { isOff: false, fixedCount: '2' } }))
    assertBlocked('count-neg', JSON.stringify({ '2026-08-13': { isOff: false, fixedCount: -2 } }))
    assertBlocked('count-float', JSON.stringify({ '2026-08-13': { isOff: false, fixedCount: 1.5 } }))
    assertBlocked('payments', JSON.stringify({
      '2026-08-13': { isOff: false, callDetails: [{ id: 'x', payments: { amount: 1 } }] },
    }))
  })
})

describe('pending 큐와 번호 변경·삭제', () => {
  test('옛 번호 quota pending B → 번호 변경 → retry 후 새 번호에 B, 옛 로그·옛 큐 없음', () => {
    const owner = 'veh-pending-move'
    const oldNum = '11가0001'
    const newNum = '11가0002'
    const dateKey = '2026-08-14'
    commitCars(owner, [{
      id: 'car-pend', type: 'sub', number: oldNum, driverName: '한', driverPhone: '010-0001-0002',
    }], { syncToCloud: false })
    commitLogWorkData(owner, oldNum, { [dateKey]: { isOff: false, fixedCount: 1 } })
    const oldPending = pendingOwnerForLog(owner, oldNum)
    const proto = Object.getPrototypeOf(localStorage)
    const original = proto.setItem
    const spy = mock.method(proto, 'setItem', function patched(/** @type {string} */ key, /** @type {string} */ value) {
      if (key === durableKey(oldPending)) throw new Error('quota exceeded (simulated)')
      return original.call(localStorage, key, value)
    })
    try {
      registerPendingDayWrite(oldPending, dateKey, patch(9))
    } finally {
      spy.mock.restore()
    }
    assert.equal(getPendingDayWrite(oldPending, dateKey)?.fixedCount, 9)
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    const result = requestVehicleSave({
      ownerKey: owner,
      cars: getState().cars[owner],
      editingId: 'car-pend',
      draft: { number: newNum, type: 'sub', driverName: '한', driverPhone: '010-0001-0002' },
    })
    unsubscribe()
    assert.equal(result.failed, false)
    assert.equal(notifyCount, 1)
    const newPending = pendingOwnerForLog(owner, newNum)
    assert.equal(getPendingDayWrite(newPending, dateKey)?.fixedCount, 9)
    assert.equal(getPendingDayWrite(oldPending, dateKey), undefined)
    assert.equal(localStorage.getItem(storageKeyForLog(owner, oldNum)), null)
    retryPendingDayWrites()
    assert.equal(getState().workLogs[owner][newNum][dateKey].fixedCount, 9)
    assert.equal(getState().workLogs[owner][oldNum], undefined)
    assert.equal(getPendingDayWrite(newPending, dateKey), undefined)
    assert.equal(pendingDayWriteCount(), 0)
  })

  test('번호 변경은 callback·fallback·unsafe를 새 pending owner로 옮기고 다른 owner는 유지한다', () => {
    const owner = 'veh-callback-move'
    const other = 'veh-other-keep'
    const oldNum = '41가4101'
    const newNum = '41가4102'
    const keepNum = '99하9999'
    const dateKey = '2026-08-20'
    commitCars(owner, [{
      id: 'car-cb', type: 'sub', number: oldNum, driverName: '콜', driverPhone: '010-4101-4102',
    }], { syncToCloud: false })
    commitCars(other, [{
      id: 'car-keep', type: 'sub', number: keepNum, driverName: '유', driverPhone: '010-9999-9999',
    }], { syncToCloud: false })
    commitLogWorkData(owner, oldNum, { [dateKey]: { isOff: false, fixedCount: 1 } })
    commitLogWorkData(other, keepNum, { [dateKey]: { isOff: false, fixedCount: 8 } })
    const oldPending = pendingOwnerForLog(owner, oldNum)
    const otherPending = pendingOwnerForLog(other, keepNum)
    /** @type {Array<boolean>} */
    const settled = []
    const proto = Object.getPrototypeOf(localStorage)
    const original = proto.setItem
    const spy = mock.method(proto, 'setItem', function patched(/** @type {string} */ key, /** @type {string} */ value) {
      if (key === durableKey(oldPending)) throw new Error('quota exceeded (simulated)')
      return original.call(localStorage, key, value)
    })
    try {
      registerPendingDayWrite(oldPending, dateKey, patch(9), (ok) => { settled.push(ok) })
    } finally {
      spy.mock.restore()
    }
    registerPendingDayWrite(otherPending, dateKey, patch(8))
    markUnsafeRegistrationFailure(oldPending, dateKey, {
      isOff: false, fixedCount: 3, palletCount: 0,
      callDetails: [{ id: 'trp-cb', fare: '1,000', client: '한진', payments: [{ amount: 'oops' }] }],
      fixedRouteCounts: {},
    })
    const journalBeforeOther = localStorage.getItem(`reactPracticeDirtyJournal:${other}`)
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    const apiBefore = totalStubCalls()
    const dirtyOtherBefore = hasDirty(other)
    const result = requestVehicleSave({
      ownerKey: owner,
      cars: getState().cars[owner],
      editingId: 'car-cb',
      draft: { number: newNum, type: 'sub', driverName: '콜', driverPhone: '010-4101-4102' },
    })
    unsubscribe()
    assert.equal(result.failed, false)
    assert.equal(notifyCount, 1)
    assert.equal(totalStubCalls(), apiBefore)
    assert.equal(hasDirty(owner), true)
    assert.equal(hasDirty(other), dirtyOtherBefore)
    assert.equal(localStorage.getItem(`reactPracticeDirtyJournal:${other}`), journalBeforeOther)
    const newPending = pendingOwnerForLog(owner, newNum)
    assert.equal(getPendingDayWrite(oldPending, dateKey), undefined)
    assert.equal(getPendingDayWrite(newPending, dateKey)?.fixedCount, 9)
    assert.equal(getPendingDayWrite(otherPending, dateKey)?.fixedCount, 8)
    assert.equal(hasUnsafeRegistration(oldPending, dateKey), false)
    assert.equal(hasUnsafeRegistration(newPending, dateKey), true)
    retryPendingDayWrites()
    assert.deepEqual(settled, [true])
    assert.equal(getState().workLogs[owner][newNum][dateKey].fixedCount, 9)
    assert.equal(getState().workLogs[other][keepNum][dateKey].fixedCount, 8)
  })

  test('새 durable 키 쓰기 실패 시 옛 pending·callback·unsafe가 남는다', () => {
    const owner = 'veh-durable-write-fail'
    const oldNum = '51가5101'
    const newNum = '51가5102'
    const dateKey = '2026-08-21'
    commitCars(owner, [{
      id: 'car-dw', type: 'sub', number: oldNum, driverName: '실', driverPhone: '010-5101-5102',
    }], { syncToCloud: false })
    commitLogWorkData(owner, oldNum, { [dateKey]: { isOff: false, fixedCount: 2 } })
    const oldPending = pendingOwnerForLog(owner, oldNum)
    /** @type {Array<boolean>} */
    const settled = []
    registerPendingDayWrite(oldPending, dateKey, patch(6), (ok) => { settled.push(ok) })
    markUnsafeRegistrationFailure(oldPending, dateKey, {
      isOff: false, fixedCount: 4, palletCount: 0,
      callDetails: [{ id: 'trp-dw', fare: '1,000', client: '한진', payments: [{ amount: 'oops' }] }],
      fixedRouteCounts: {},
    })
    const carsRaw = localStorage.getItem(storageKeyFor('cars', owner))
    const logRaw = localStorage.getItem(storageKeyForLog(owner, oldNum))
    const journalRaw = localStorage.getItem(`reactPracticeDirtyJournal:${owner}`)
    const proto = Object.getPrototypeOf(localStorage)
    const original = proto.setItem
    const spy = mock.method(proto, 'setItem', function patched(/** @type {string} */ key, /** @type {string} */ value) {
      if (key === durableKey(pendingOwnerForLog(owner, newNum))) throw new Error('quota exceeded (simulated)')
      return original.call(localStorage, key, value)
    })
    const errSpy = spyQuotaConsole('[vehicleMutations] 차량 저장 실패:')
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    const apiBefore = totalStubCalls()
    try {
      const result = requestVehicleSave({
        ownerKey: owner,
        cars: getState().cars[owner],
        editingId: 'car-dw',
        draft: { number: newNum, type: 'sub', driverName: '실', driverPhone: '010-5101-5102' },
      })
      assert.equal(result.failed, true)
      errSpy.assertOnce()
      assert.equal(notifyCount, 0)
      assert.equal(totalStubCalls(), apiBefore)
      assert.equal(settled.length, 0)
      assert.equal(getPendingDayWrite(oldPending, dateKey)?.fixedCount, 6)
      assert.equal(hasUnsafeRegistration(oldPending, dateKey), true)
      assert.equal(getState().cars[owner][0].number, oldNum)
      assert.equal(localStorage.getItem(storageKeyFor('cars', owner)), carsRaw)
      assert.equal(localStorage.getItem(storageKeyForLog(owner, oldNum)), logRaw)
      assert.equal(localStorage.getItem(`reactPracticeDirtyJournal:${owner}`), journalRaw)
    } finally {
      unsubscribe()
      errSpy.restore()
      spy.mock.restore()
    }
  })

  test('unsafe overlay는 번호 변경 시 새 pending owner로 이관된다', () => {
    const owner = 'veh-unsafe-move'
    const oldNum = '21가2101'
    const newNum = '21가2102'
    const dateKey = '2026-08-18'
    commitCars(owner, [{
      id: 'car-unsafe', type: 'sub', number: oldNum, driverName: '위', driverPhone: '010-2101-2102',
    }], { syncToCloud: false })
    commitLogWorkData(owner, oldNum, { [dateKey]: { isOff: false, fixedCount: 1 } })
    const oldPending = pendingOwnerForLog(owner, oldNum)
    const unsafePatch = {
      isOff: false,
      fixedCount: 9,
      palletCount: 0,
      callDetails: [{ id: 'trp-unsafe-move', fare: '10,000', client: '한진', payments: [{ amount: 'oops' }] }],
      fixedRouteCounts: {},
    }
    markUnsafeRegistrationFailure(oldPending, dateKey, unsafePatch)
    const result = requestVehicleSave({
      ownerKey: owner,
      cars: getState().cars[owner],
      editingId: 'car-unsafe',
      draft: { number: newNum, type: 'sub', driverName: '위', driverPhone: '010-2101-2102' },
    })
    assert.equal(result.failed, false)
    const newPending = pendingOwnerForLog(owner, newNum)
    assert.equal(hasUnsafeRegistration(oldPending, dateKey), false)
    assert.equal(hasUnsafeRegistration(newPending, dateKey), true)
    assert.equal(getUnsafeRegistrationPatch(newPending, dateKey)?.fixedCount, 9)
  })

  test('pending 있는 서브 차량 삭제 후 retry해도 차량·로그가 부활하지 않는다', async () => {
    const owner = 'veh-pending-del'
    const num = '12가1212'
    const dateKey = '2026-08-15'
    commitCars(owner, [{
      id: 'car-del', type: 'sub', number: num, driverName: '오', driverPhone: '010-1212-1212',
    }], { syncToCloud: false })
    commitLogWorkData(owner, num, { [dateKey]: { isOff: false, fixedCount: 3 } })
    registerPendingDayWrite(pendingOwnerForLog(owner, num), dateKey, patch(4))
    const result = await requestVehicleDeletion({
      ownerKey: owner, userId: null, cars: getState().cars[owner], vehicleId: 'car-del',
    })
    assert.match(result.toast || '', /삭제했습니다/)
    assert.equal(getState().cars[owner].length, 0)
    assert.equal(getState().workLogs[owner][num], undefined)
    assert.equal(localStorage.getItem(storageKeyForLog(owner, num)), null)
    retryPendingDayWrites()
    assert.equal(getState().cars[owner].length, 0)
    assert.equal(getState().workLogs[owner][num], undefined)
    assert.equal(getPendingDayWrite(pendingOwnerForLog(owner, num), dateKey), undefined)
  })

  test('한 차량 삭제는 같은 owner의 다른 차량 pending과 다른 owner 데이터를 유지한다', async () => {
    const owner = 'veh-del-isolate'
    const other = 'veh-del-other-owner'
    const dropNum = '61가6101'
    const keepNum = '61가6102'
    const otherNum = '71나7101'
    const dateKey = '2026-08-22'
    commitCars(owner, [
      { id: 'car-drop', type: 'sub', number: dropNum, driverName: '삭', driverPhone: '010-6101-6101' },
      { id: 'car-keep', type: 'sub', number: keepNum, driverName: '남', driverPhone: '010-6102-6102' },
    ], { syncToCloud: false })
    commitCars(other, [
      { id: 'car-other', type: 'sub', number: otherNum, driverName: '타', driverPhone: '010-7101-7101' },
    ], { syncToCloud: false })
    commitLogWorkData(owner, dropNum, { [dateKey]: { isOff: false, fixedCount: 1 } })
    commitLogWorkData(owner, keepNum, { [dateKey]: { isOff: false, fixedCount: 5 } })
    commitLogWorkData(other, otherNum, { [dateKey]: { isOff: false, fixedCount: 7 } })
    registerPendingDayWrite(pendingOwnerForLog(owner, dropNum), dateKey, patch(2))
    registerPendingDayWrite(pendingOwnerForLog(owner, keepNum), dateKey, patch(5))
    registerPendingDayWrite(pendingOwnerForLog(other, otherNum), dateKey, patch(7))
    const otherJournal = localStorage.getItem(`reactPracticeDirtyJournal:${other}`)
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    const apiBefore = totalStubCalls()
    const result = await requestVehicleDeletion({
      ownerKey: owner, userId: null, cars: getState().cars[owner], vehicleId: 'car-drop',
    })
    unsubscribe()
    assert.match(result.toast || '', /삭제했습니다/)
    assert.equal(notifyCount, 1)
    assert.equal(totalStubCalls(), apiBefore)
    assert.equal(getState().cars[owner].map((item) => item.id).join(','), 'car-keep')
    assert.equal(getState().workLogs[owner][dropNum], undefined)
    assert.equal(getState().workLogs[owner][keepNum][dateKey].fixedCount, 5)
    assert.equal(getPendingDayWrite(pendingOwnerForLog(owner, dropNum), dateKey), undefined)
    assert.equal(getPendingDayWrite(pendingOwnerForLog(owner, keepNum), dateKey)?.fixedCount, 5)
    assert.equal(getState().cars[other][0].number, otherNum)
    assert.equal(getState().workLogs[other][otherNum][dateKey].fixedCount, 7)
    assert.equal(getPendingDayWrite(pendingOwnerForLog(other, otherNum), dateKey)?.fixedCount, 7)
    assert.equal(localStorage.getItem(`reactPracticeDirtyJournal:${other}`), otherJournal)
  })

  test('삭제 시 해당 로그 unsafe overlay도 제거된다', async () => {
    const owner = 'veh-unsafe-del'
    const num = '22나2223'
    const dateKey = '2026-08-19'
    commitCars(owner, [{
      id: 'car-unsafe-del', type: 'sub', number: num, driverName: '삭', driverPhone: '010-2223-2223',
    }], { syncToCloud: false })
    commitLogWorkData(owner, num, { [dateKey]: { isOff: false, fixedCount: 2 } })
    const pending = pendingOwnerForLog(owner, num)
    markUnsafeRegistrationFailure(pending, dateKey, {
      isOff: false,
      fixedCount: 5,
      palletCount: 0,
      callDetails: [{ id: 'trp-unsafe-del', fare: '1,000', client: '한진', payments: [{ amount: 'oops' }] }],
      fixedRouteCounts: {},
    })
    const result = await requestVehicleDeletion({
      ownerKey: owner, userId: null, cars: getState().cars[owner], vehicleId: 'car-unsafe-del',
    })
    assert.match(result.toast || '', /삭제했습니다/)
    assert.equal(hasUnsafeRegistration(pending, dateKey), false)
    assert.equal(getState().workLogs[owner][num], undefined)
  })

  test('cleanup 실패 시 최신 patch가 새 번호 큐에 남는다', () => {
    const owner = 'veh-cleanup-fail'
    const oldNum = '13가1313'
    const newNum = '14나1414'
    const dateKey = '2026-08-16'
    commitCars(owner, [{
      id: 'car-cu', type: 'sub', number: oldNum, driverName: '유', driverPhone: '010-1313-1414',
    }], { syncToCloud: false })
    commitLogWorkData(owner, oldNum, { [dateKey]: { isOff: false, fixedCount: 2 } })
    registerPendingDayWrite(pendingOwnerForLog(owner, oldNum), dateKey, patch(7))
    const moved = requestVehicleSave({
      ownerKey: owner,
      cars: getState().cars[owner],
      editingId: 'car-cu',
      draft: { number: newNum, type: 'sub', driverName: '유', driverPhone: '010-1313-1414' },
    })
    assert.equal(moved.failed, false)
    const newPending = pendingOwnerForLog(owner, newNum)
    const proto = Object.getPrototypeOf(localStorage)
    const original = proto.setItem
    const spy = mock.method(proto, 'setItem', function patched(/** @type {string} */ key, /** @type {string} */ value) {
      if (key === durableKey(newPending)) throw new Error('quota exceeded (simulated)')
      return original.call(localStorage, key, value)
    })
    try {
      retryPendingDayWrites()
    } finally {
      spy.mock.restore()
    }
    assert.equal(getState().workLogs[owner][newNum][dateKey].fixedCount, 7)
    assert.equal(getPendingDayWrite(newPending, dateKey)?.fixedCount, 7)
  })

  test('durable 읽기 실패 시 번호 변경을 진행하지 않는다', () => {
    const owner = 'veh-durable-unread'
    const oldNum = '15다1515'
    const newNum = '16라1616'
    commitCars(owner, [{
      id: 'car-du', type: 'sub', number: oldNum, driverName: '금', driverPhone: '010-1515-1616',
    }], { syncToCloud: false })
    commitLogWorkData(owner, oldNum, { '2026-08-17': { isOff: false, fixedCount: 2 } })
    const proto = Object.getPrototypeOf(localStorage)
    const originalGet = proto.getItem
    const spy = mock.method(proto, 'getItem', function patched(/** @type {string} */ key) {
      if (key === durableKey(pendingOwnerForLog(owner, oldNum))) throw new Error('durable getItem fail')
      return originalGet.call(localStorage, key)
    })
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    try {
      const result = requestVehicleSave({
        ownerKey: owner,
        cars: getState().cars[owner],
        editingId: 'car-du',
        draft: { number: newNum, type: 'sub', driverName: '금', driverPhone: '010-1515-1616' },
      })
      assert.equal(result.failed, true)
      assert.equal(notifyCount, 0)
      assert.equal(getState().cars[owner][0].number, oldNum)
    } finally {
      unsubscribe()
      spy.mock.restore()
    }
  })
})

describe('requestClientSave / requestClientReorder', () => {
  test('거래처 persist 실패 시 Store가 롤백되고 console.error가 1회다', () => {
    const owner = 'cli-quota-fail'
    commitClients(owner, [{ id: 'keep', companyName: '유지' }], { syncToCloud: false })
    const proto = Object.getPrototypeOf(localStorage)
    const original = proto.setItem
    const failKey = storageKeyFor('clients', owner)
    const spy = mock.method(proto, 'setItem', function patched(/** @type {string} */ key, /** @type {string} */ value) {
      if (key === failKey && value.includes('신규')) throw new Error('quota exceeded (simulated)')
      return original.call(localStorage, key, value)
    })
    const errSpy = spyQuotaConsole('[clientMutations] 거래처 저장 실패:')
    try {
      const result = requestClientSave({
        ownerKey: owner,
        clients: getState().clients[owner] || [],
        editingId: null,
        draft: { companyName: '신규' },
      })
      assert.equal(result.failed, true)
      errSpy.assertOnce()
      assert.equal(getState().clients[owner]?.[0]?.companyName, '유지')
      assert.equal(readJsonKey('clients', owner, /** @type {Array<{ companyName: string }>} */ ([]))[0]?.companyName, '유지')
    } finally {
      errSpy.restore()
      spy.mock.restore()
    }
  })

  test('핀/비핀 교차 재정렬은 persist를 호출하지 않는다', () => {
    const owner = 'cli-cross-drag'
    const clients = [
      { id: 'pin', companyName: '핀', isPinned: true },
      { id: 'rest', companyName: '일반', isPinned: false },
    ]
    commitClients(owner, clients, { syncToCloud: false })
    const result = requestClientReorder({ ownerKey: owner, clients, fromId: 'pin', toId: 'rest' })
    assert.equal(result.rejected, true)
    assert.deepEqual(getState().clients[owner].map((item) => item.id), ['pin', 'rest'])
  })

  test('hydration failed면 차량 추가가 Store를 바꾸지 않는다', () => {
    const owner = 'veh-hyd-fail'
    resetStubSupabaseCallCounts()
    beginSessionEpoch('user-hyd-fail', owner)
    setHydration({ status: 'failed', userId: 'user-hyd-fail', ownerKey: owner })
    commitCars(owner, [], { syncToCloud: false })
    const before = JSON.stringify(getState().cars[owner])
    const result = requestVehicleSave({
      ownerKey: owner,
      cars: getState().cars[owner],
      editingId: null,
      draft: { number: '55마5555', type: 'main' },
    })
    assert.equal(result.failed, true)
    assert.equal(JSON.stringify(getState().cars[owner]), before)
    assert.equal(totalStubCalls(), 0)
  })

  test('hydration failed면 거래처 추가가 Store와 localStorage를 바꾸지 않는다', () => {
    const owner = 'cli-hyd-fail'
    beginSessionEpoch('user-cli-hyd', owner)
    setHydration({ status: 'failed', userId: 'user-cli-hyd', ownerKey: owner })
    commitClients(owner, [], { syncToCloud: false })
    const beforeStore = JSON.stringify(getState().clients[owner])
    const beforeLs = localStorage.getItem(storageKeyFor('clients', owner))
    const result = requestClientSave({
      ownerKey: owner,
      clients: getState().clients[owner] || [],
      editingId: null,
      draft: { companyName: '차단' },
    })
    assert.equal(result.failed, true)
    assert.equal(JSON.stringify(getState().clients[owner]), beforeStore)
    assert.equal(localStorage.getItem(storageKeyFor('clients', owner)), beforeLs)
  })

  test('requestClientFixedUnitPrice는 단가만 바꾸고 hydration failed면 Store를 유지한다', () => {
    const owner = 'cli-unit-price'
    beginSessionEpoch('user-unit', owner)
    setHydration({ status: 'ready', userId: 'user-unit', ownerKey: owner })
    commitClients(owner, [
      { id: 'c1', companyName: '한진', fixedRouteLinked: true, fixedUnitPrice: 10000 },
      { id: 'c2', companyName: '대한', fixedUnitPrice: 20000 },
    ], { syncToCloud: false })
    const ok = requestClientFixedUnitPrice({
      ownerKey: owner,
      userId: 'user-unit',
      clients: getState().clients[owner] || [],
      clientId: 'c1',
      nextPrice: 15000,
    })
    assert.equal(ok.failed, false)
    assert.equal(getState().clients[owner].find((c) => c.id === 'c1')?.fixedUnitPrice, 15000)
    assert.equal(getState().clients[owner].find((c) => c.id === 'c2')?.fixedUnitPrice, 20000)

    setHydration({ status: 'failed', userId: 'user-unit', ownerKey: owner })
    const before = JSON.stringify(getState().clients[owner])
    const blocked = requestClientFixedUnitPrice({
      ownerKey: owner,
      userId: 'user-unit',
      clients: getState().clients[owner] || [],
      clientId: 'c1',
      nextPrice: 99999,
    })
    assert.equal(blocked.failed, true)
    assert.equal(JSON.stringify(getState().clients[owner]), before)
  })

  test('requestClientTaxInfo는 세무 필드만 바꾸고 persist 실패 시 Store를 유지한다', () => {
    const owner = 'cli-tax-info'
    beginSessionEpoch('user-tax', owner)
    setHydration({ status: 'ready', userId: 'user-tax', ownerKey: owner })
    commitClients(owner, [
      { id: 't1', companyName: '세무거래처', bizNumber: '111' },
      { id: 't2', companyName: '다른곳', bizNumber: '222' },
    ], { syncToCloud: false })
    const ok = requestClientTaxInfo({
      ownerKey: owner,
      userId: 'user-tax',
      clients: getState().clients[owner] || [],
      companyName: '세무거래처',
      patch: { bizNumber: '999-88-77777', taxEmail: 'a@b.c' },
    })
    assert.equal(ok.failed, false)
    assert.equal(getState().clients[owner].find((c) => c.id === 't1')?.bizNumber, '999-88-77777')
    assert.equal(getState().clients[owner].find((c) => c.id === 't1')?.taxEmail, 'a@b.c')
    assert.equal(getState().clients[owner].find((c) => c.id === 't2')?.bizNumber, '222')

    const proto = Object.getPrototypeOf(localStorage)
    const original = proto.setItem
    const failKey = storageKeyFor('clients', owner)
    const spy = mock.method(proto, 'setItem', function patched(/** @type {string} */ key, /** @type {string} */ value) {
      if (key === failKey && value.includes('boom')) throw new Error('quota exceeded (simulated)')
      return original.call(localStorage, key, value)
    })
    const errSpy = spyQuotaConsole('[clientMutations] 거래처 세무정보 저장 실패:')
    const before = JSON.stringify(getState().clients[owner])
    try {
      const fail = requestClientTaxInfo({
        ownerKey: owner,
        userId: 'user-tax',
        clients: getState().clients[owner] || [],
        companyName: '세무거래처',
        patch: { bizNumber: 'boom' },
      })
      assert.equal(fail.failed, true)
      errSpy.assertOnce()
      assert.equal(JSON.stringify(getState().clients[owner]), before)
    } finally {
      errSpy.restore()
      spy.mock.restore()
    }
  })

  test('계정 B ready에서 stale owner A 저장은 A/B Store·localStorage·notify·API가 불변이다', () => {
    const ownerA = 'stale-owner-a'
    const ownerB = 'ready-owner-b'
    beginSessionEpoch('user-b', ownerB)
    setHydration({ status: 'ready', userId: 'user-b', ownerKey: ownerB })
    commitClients(ownerA, [{ id: 'a1', companyName: '에이' }], { syncToCloud: false })
    commitClients(ownerB, [{ id: 'b1', companyName: '비' }], { syncToCloud: false })
    commitCars(ownerA, [{ id: 'ca', number: '11가1111', type: 'main' }], { syncToCloud: false })
    commitCars(ownerB, [{ id: 'cb', number: '22나2222', type: 'main' }], { syncToCloud: false })
    const snap = {
      clientsA: JSON.stringify(getState().clients[ownerA]),
      clientsB: JSON.stringify(getState().clients[ownerB]),
      carsA: JSON.stringify(getState().cars[ownerA]),
      carsB: JSON.stringify(getState().cars[ownerB]),
      lsA: localStorage.getItem(storageKeyFor('clients', ownerA)),
      lsB: localStorage.getItem(storageKeyFor('clients', ownerB)),
      carsLsA: localStorage.getItem(storageKeyFor('cars', ownerA)),
      carsLsB: localStorage.getItem(storageKeyFor('cars', ownerB)),
    }
    const apiBefore = totalStubCalls()
    let notifyCount = 0
    const unsub = subscribe(() => { notifyCount += 1 })
    const clientSave = requestClientSave({
      ownerKey: ownerA, userId: 'user-a', clients: getState().clients[ownerA], editingId: null,
      draft: { companyName: '침범' },
    })
    const carSave = requestVehicleSave({
      ownerKey: ownerA, userId: 'user-a', cars: getState().cars[ownerA], editingId: null,
      draft: { number: '33다3333', type: 'sub', driverName: '가', driverPhone: '010-0000-0000' },
    })
    unsub()
    assert.equal(clientSave.failed, true)
    assert.equal(carSave.failed, true)
    assert.equal(notifyCount, 0)
    assert.equal(totalStubCalls(), apiBefore)
    assert.equal(JSON.stringify(getState().clients[ownerA]), snap.clientsA)
    assert.equal(JSON.stringify(getState().clients[ownerB]), snap.clientsB)
    assert.equal(JSON.stringify(getState().cars[ownerA]), snap.carsA)
    assert.equal(JSON.stringify(getState().cars[ownerB]), snap.carsB)
    assert.equal(localStorage.getItem(storageKeyFor('clients', ownerA)), snap.lsA)
    assert.equal(localStorage.getItem(storageKeyFor('clients', ownerB)), snap.lsB)
    assert.equal(localStorage.getItem(storageKeyFor('cars', ownerA)), snap.carsLsA)
    assert.equal(localStorage.getItem(storageKeyFor('cars', ownerB)), snap.carsLsB)
  })
})
