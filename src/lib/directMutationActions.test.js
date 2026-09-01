// Step 0-4 감사 보완 4차: 사용자 지시 6번("API 함수만 테스트하고 컴포넌트 코드상 로컬
// 유지가 보장된다고 주장하지 마라") — 이 파일은 컴포넌트가 실제로 호출하는 서비스
// 함수(requestVehicleDeletion 등)를 직접 부른다. 이게 UI가 타는 실제 코드 경로이므로,
// 여기서 검증한 것이 곧 UI 안전성 검증이다(렌더 테스트 없이도).
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { createFakeSupabase, wait } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf, emptyOkHandlers } = createFakeSupabase()
mock.module('../supabaseClient.js', { exports: { supabase: fakeSupabase } })

const {
  requestClientDeletion,
  requestDriverDeletion,
  requestDriverInviteSave,
  requestDriverStatusChange,
  requestVehicleDeletion,
} = await import('./directMutationActions.js')
const { beginSessionEpoch, endCloudSession } = await import('./cloudSession.js')
const { setHydration, getState, subscribe } = await import('../store/app-store.js')
const { readJsonKey, storageKeyFor, writeJsonKey } = await import('../store/persist.js')
const { hasPendingOps } = await import('./mutationOutbox.js')

function beginReady(userId, ownerKey) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  beginSessionEpoch(userId, ownerKey)
  setHydration({ status: 'ready', userId, ownerKey })
}

function beginFailed(userId, ownerKey) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  beginSessionEpoch(userId, ownerKey)
  setHydration({ status: 'failed', userId, ownerKey })
}

// async: fn이 첫 await 뒤에 setItem을 부르는 경우(슬라이스 C 서버 삭제 성공 후 commit)도
// 스파이가 살아 있게 fn 완료까지 기다렸다가 복원한다.
async function withFailingSetItem(shouldFail, fn) {
  const proto = Object.getPrototypeOf(localStorage)
  const original = proto.setItem
  const spy = mock.method(proto, 'setItem', function patched(key, value) {
    if (shouldFail(key)) throw new Error('quota exceeded (simulated)')
    return original.call(this, key, value)
  })
  try {
    return await fn()
  } finally {
    spy.mock.restore()
  }
}

/** 리터럴을 DriverRecord[]로 좁혀 strict-inventory 진단(status 리터럴 widening 등)을 안 늘린다. @param {Array<import('./outboxTypes.js').DriverRecord>} items */
const asDrivers = (items) => items

describe('requestVehicleDeletion — 사용자 지시 10번 필수 시나리오', () => {
  test('failed 상태: Store 유지, localStorage 유지, 서버 호출 0회, 성공 토스트 없음', async () => {
    const ownerKey = 'dma-vehicle-failed'
    beginFailed('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '11가1111', supabaseId: 900 }]
    writeJsonKey('cars', ownerKey, cars)

    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    const result = await requestVehicleDeletion({ ownerKey, userId: 'user-1', cars, vehicleId: 'car-1' })
    unsubscribe()

    assert.deepEqual(result.cars, cars, 'Store에 반영할 cars 값이 그대로여야 한다')
    assert.deepEqual(readJsonKey('cars', ownerKey, []), cars, 'localStorage도 그대로여야 한다')
    assert.equal(countOf('vehicles', 'delete'), 0)
    assert.equal(countOf('transport_details', 'delete'), 0)
    assert.ok(result.blocked, 'blocked 사유가 있어야 한다')
    assert.doesNotMatch(result.toast, /삭제했습니다/, '성공 토스트를 보여주면 안 된다')
    assert.equal(notifyCount, 0, 'store notify가 일어나면 안 된다')
    endCloudSession()
  })

  test('ready 상태에서 성공: 본체 delete 1회, Store에서 사라짐, 재시도 큐 없음, 확정 성공 토스트', async () => {
    const ownerKey = 'dma-vehicle-success'
    beginReady('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '11가1111', supabaseId: 901 }]
    writeJsonKey('cars', ownerKey, cars)
    handlers.vehicles = { delete: () => ({ data: [{ id: 901 }], error: null }) }

    const result = await requestVehicleDeletion({ ownerKey, userId: 'user-1', cars, vehicleId: 'car-1' })

    assert.deepEqual(result.cars, [])
    assert.deepEqual(readJsonKey('cars', ownerKey, []), [])
    assert.deepEqual(getState().cars[ownerKey], [], 'Store에서도 사라져야 한다')
    assert.equal(countOf('vehicles', 'delete'), 1)
    assert.equal(hasPendingOps(ownerKey), false)
    assert.equal(result.failed, false)
    assert.equal(result.toast, '차량을 삭제했습니다.')
    endCloudSession()
  })

  test('슬라이스 C — ready + 원격 삭제 throw: Fail-Fast 토스트, Store/localStorage 저장 전 값, hasPendingOps false', async () => {
    const ownerKey = 'dma-vehicle-remote-fail'
    beginReady('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '11가1111', supabaseId: 902 }]
    writeJsonKey('cars', ownerKey, cars)
    handlers.vehicles = { delete: () => { throw new Error('network down') } }

    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    const result = await requestVehicleDeletion({ ownerKey, userId: 'user-1', cars, vehicleId: 'car-1' })
    unsubscribe()

    assert.equal(result.toast, FAIL_FAST_TOAST)
    assert.equal(result.failed, true)
    assert.deepEqual(result.cars, cars, '호출부에는 저장 전 cars를 돌려줘야 한다')
    assert.deepEqual(readJsonKey('cars', ownerKey, []), cars, 'localStorage도 저장 전 값이어야 한다')
    assert.equal(getState().cars[ownerKey], undefined, 'Store에 이 owner의 cars가 새로 생기면 안 된다')
    assert.equal(hasPendingOps(ownerKey), false, '재시도 큐/tombstone에 남으면 안 된다')
    assert.equal(notifyCount, 0)
    endCloudSession()
  })

  test('슬라이스 C — ready + { data: null, error }: Fail-Fast 토스트, hasPendingOps false, 저장 전 값', async () => {
    const ownerKey = 'dma-vehicle-data-error'
    beginReady('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '11가1111', supabaseId: 903 }]
    writeJsonKey('cars', ownerKey, cars)
    handlers.vehicles = { delete: () => ({ data: null, error: { message: 'RLS violation' } }) }

    const result = await requestVehicleDeletion({ ownerKey, userId: 'user-1', cars, vehicleId: 'car-1' })

    assert.equal(result.toast, FAIL_FAST_TOAST)
    assert.equal(hasPendingOps(ownerKey), false)
    assert.equal(getState().cars[ownerKey], undefined)
    assert.deepEqual(readJsonKey('cars', ownerKey, []), cars)
    endCloudSession()
  })

  test('슬라이스 C — 본체 delete가 0행이면(이미 없음/RLS): Fail-Fast 토스트, Store 유지, 성공 토스트 없음', async () => {
    const ownerKey = 'dma-vehicle-zero-rows'
    beginReady('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '11가1111', supabaseId: 907 }]
    writeJsonKey('cars', ownerKey, cars)
    handlers.vehicles = { delete: () => ({ data: [], error: null }) } // 삭제됐지만 0행

    const result = await requestVehicleDeletion({ ownerKey, userId: 'user-1', cars, vehicleId: 'car-1' })

    assert.equal(result.toast, FAIL_FAST_TOAST)
    assert.doesNotMatch(result.toast, /삭제했습니다/)
    assert.equal(countOf('vehicles', 'delete'), 1)
    assert.equal(getState().cars[ownerKey], undefined)
    assert.deepEqual(readJsonKey('cars', ownerKey, []), cars, '0행 삭제는 Store/LS를 건드리면 안 된다')
    assert.equal(hasPendingOps(ownerKey), false)
    endCloudSession()
  })

  test('슬라이스 C — 세션 전환(delete await 이후 로그아웃): Store/localStorage 미반영', async () => {
    const ownerKey = 'dma-vehicle-epoch'
    beginReady('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '11가1111', supabaseId: 908 }]
    writeJsonKey('cars', ownerKey, cars)
    let releaseDelete = () => {}
    const gate = new Promise((resolve) => { releaseDelete = resolve })
    handlers.vehicles = { delete: () => gate.then(() => ({ data: [{ id: 908 }], error: null })) }

    const promise = requestVehicleDeletion({ ownerKey, userId: 'user-1', cars, vehicleId: 'car-1' })
    await wait(10)
    endCloudSession() // 응답 대기 중 로그아웃

    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    releaseDelete()
    await promise
    unsubscribe()

    assert.equal(notifyCount, 0)
    assert.equal(getState().cars[ownerKey], undefined)
    assert.deepEqual(readJsonKey('cars', ownerKey, []), cars)
    assert.equal(hasPendingOps(ownerKey), false)
  })

  test('retry 성공 후(hydrate 등으로 ready 전환) 같은 작업을 다시 하면 로컬·서버가 최종적으로 일치한다', async () => {
    const ownerKey = 'dma-vehicle-retry-then-repeat'
    beginFailed('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '11가1111', supabaseId: 904 }]
    writeJsonKey('cars', ownerKey, cars)

    const blockedResult = await requestVehicleDeletion({ ownerKey, userId: 'user-1', cars, vehicleId: 'car-1' })
    assert.ok(blockedResult.blocked)
    assert.equal(countOf('vehicles', 'delete'), 0)

    setHydration({ status: 'ready', userId: 'user-1', ownerKey })
    const retryResult = await requestVehicleDeletion({ ownerKey, userId: 'user-1', cars: blockedResult.cars, vehicleId: 'car-1' })

    assert.deepEqual(retryResult.cars, [])
    assert.deepEqual(readJsonKey('cars', ownerKey, []), [])
    assert.equal(countOf('vehicles', 'delete'), 1)
    assert.equal(hasPendingOps(ownerKey), false)
    endCloudSession()
  })

  test('supabaseId가 없는 로컬 차량도 로그인+hydration failed면 삭제하지 않는다', async () => {
    const ownerKey = 'dma-vehicle-local-only'
    beginFailed('user-1', ownerKey)
    const cars = [{ id: 'car-local', number: '99하9999' }]
    writeJsonKey('cars', ownerKey, cars)
    const result = await requestVehicleDeletion({ ownerKey, userId: 'user-1', cars, vehicleId: 'car-local' })
    assert.deepEqual(result.cars, cars)
    assert.equal(result.failed, true)
    assert.equal(result.closeModal, false)
    assert.equal(countOf('vehicles', 'delete'), 0)
    endCloudSession()
  })

  test('게스트(세션 없음)의 로컬 차량은 바로 삭제된다', async () => {
    endCloudSession()
    const ownerKey = 'dma-vehicle-guest-local'
    const cars = [{ id: 'car-guest', number: '88하8888' }]
    writeJsonKey('cars', ownerKey, cars)
    const result = await requestVehicleDeletion({ ownerKey, userId: null, cars, vehicleId: 'car-guest' })
    assert.deepEqual(result.cars, [])
    assert.equal(result.failed, false)
    assert.equal(countOf('vehicles', 'delete'), 0)
  })
})

describe('실패 주입 — 슬라이스 C: 서버 삭제 성공 뒤 로컬 commit이 실패하는 경우', () => {
  // 슬라이스 C: 서버 삭제는 이미 끝난 뒤 cars localStorage 쓰기가 실패하면, throw 없이
  // Fail-Fast 토스트 + 저장 전 값으로 알린다(다음 hydrate가 서버=빈 목록으로 맞춘다).
  test('cars localStorage 쓰기가 실패하면 throw 없이 Fail-Fast 토스트, 로컬 목록은 저장 전 값, store/notify 불변', async () => {
    const ownerKey = 'dma-vehicle-atomic-fail'
    beginReady('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '11가1111', supabaseId: 905 }]
    writeJsonKey('cars', ownerKey, cars)
    handlers.vehicles = { delete: () => ({ data: [{ id: 905 }], error: null }) }
    const carsKey = storageKeyFor('cars', ownerKey)
    const carsRawBefore = localStorage.getItem(carsKey)

    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })

    let result
    await assert.doesNotReject(async () => {
      result = await withFailingSetItem((key) => key === carsKey, () => requestVehicleDeletion({ ownerKey, userId: 'user-1', cars, vehicleId: 'car-1' }))
    })
    unsubscribe()

    assert.equal(result.failed, true)
    assert.equal(result.toast, FAIL_FAST_TOAST)
    assert.deepEqual(result.cars, cars, '호출부에는 저장 전 cars를 그대로 돌려줘야 한다')
    assert.equal(localStorage.getItem(carsKey), carsRawBefore, 'cars localStorage는 저장 전 값이어야 한다')
    assert.equal(getState().cars[ownerKey], undefined, 'store에 이 owner의 cars가 새로 생기면 안 된다')
    assert.equal(notifyCount, 0)
    assert.equal(countOf('vehicles', 'delete'), 1, '서버 삭제는 이미 성공했다(다음 hydrate가 로컬을 맞춘다)')
    endCloudSession()
  })
})

describe('requestClientDeletion — 사용자 지시 10번 필수 시나리오', () => {
  test('failed 상태: Store 유지, localStorage 유지, 서버 호출 0회, 성공 토스트 없음', async () => {
    const ownerKey = 'dma-client-failed'
    beginFailed('user-1', ownerKey)
    const clients = [{ id: 'client-1', companyName: '한진', supabaseId: 700 }]
    writeJsonKey('clients', ownerKey, clients)

    const result = await requestClientDeletion({ ownerKey, userId: 'user-1', clients, clientId: 'client-1' })

    assert.deepEqual(result.clients, clients)
    assert.deepEqual(readJsonKey('clients', ownerKey, []), clients)
    assert.equal(countOf('clients', 'delete'), 0)
    assert.doesNotMatch(result.toast, /삭제했습니다/)
    endCloudSession()
  })

  test('ready 상태에서 성공: 본체 delete 1회, Store에서 사라짐, 재시도 큐 없음', async () => {
    const ownerKey = 'dma-client-success'
    beginReady('user-1', ownerKey)
    const clients = [{ id: 'client-1', companyName: '한진', supabaseId: 701 }]
    writeJsonKey('clients', ownerKey, clients)
    handlers.clients = { delete: () => ({ data: [{ id: 701 }], error: null }) }

    const result = await requestClientDeletion({ ownerKey, userId: 'user-1', clients, clientId: 'client-1' })
    assert.deepEqual(result.clients, [])
    assert.equal(countOf('clients', 'delete'), 1)
    assert.deepEqual(getState().clients[ownerKey], [], 'Store에서도 사라져야 한다')
    assert.equal(hasPendingOps(ownerKey), false)
    assert.equal(result.failed, false)
    assert.match(result.toast, /거래처를 삭제했습니다/)
    endCloudSession()
  })

  test('슬라이스 C — ready + 원격 삭제 throw: Fail-Fast 토스트, Store 저장 전 값, hasPendingOps false', async () => {
    const ownerKey = 'dma-client-throw'
    beginReady('user-1', ownerKey)
    const clients = [{ id: 'client-1', companyName: '한진', supabaseId: 702 }]
    writeJsonKey('clients', ownerKey, clients)
    handlers.clients = { delete: () => { throw new Error('network down') } }

    const result = await requestClientDeletion({ ownerKey, userId: 'user-1', clients, clientId: 'client-1' })

    assert.equal(result.toast, FAIL_FAST_TOAST)
    assert.equal(result.failed, true)
    assert.deepEqual(result.clients, clients)
    assert.deepEqual(readJsonKey('clients', ownerKey, []), clients)
    assert.equal(getState().clients[ownerKey], undefined)
    assert.equal(hasPendingOps(ownerKey), false)
    endCloudSession()
  })

  test('슬라이스 C — 본체 delete가 0행이면: Fail-Fast 토스트, Store 유지, 성공 토스트 없음', async () => {
    const ownerKey = 'dma-client-zero-rows'
    beginReady('user-1', ownerKey)
    const clients = [{ id: 'client-1', companyName: '한진', supabaseId: 703 }]
    writeJsonKey('clients', ownerKey, clients)
    handlers.clients = { delete: () => ({ data: [], error: null }) }

    const result = await requestClientDeletion({ ownerKey, userId: 'user-1', clients, clientId: 'client-1' })

    assert.equal(result.toast, FAIL_FAST_TOAST)
    assert.doesNotMatch(result.toast, /삭제했습니다/)
    assert.equal(countOf('clients', 'delete'), 1)
    assert.equal(getState().clients[ownerKey], undefined)
    assert.deepEqual(readJsonKey('clients', ownerKey, []), clients)
    assert.equal(hasPendingOps(ownerKey), false)
    endCloudSession()
  })
})

// 슬라이스 A·B 공통 Fail-Fast 실패 토스트.
const FAIL_FAST_TOAST = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'

describe('requestDriverStatusChange / requestDriverDeletion — 슬라이스 B: outbox 없이 직접 1회(Fail-Fast)', () => {
  test('failed hydration 상태에서 기사 상태변경 시도: Store 유지, localStorage 유지, 서버 호출 0회, 성공 토스트 없음', async () => {
    const ownerKey = 'dma-driver-status-failed'
    beginFailed('user-1', ownerKey)
    const drivers = asDrivers([{ id: 'drv-1', name: '기사', supabaseId: 600, status: 'pending' }])
    writeJsonKey('drivers', ownerKey, drivers)

    const result = await requestDriverStatusChange({ ownerKey, userId: 'user-1', drivers, driverId: 'drv-1', status: 'linked', cloud: true })

    assert.deepEqual(result.drivers, drivers)
    assert.deepEqual(readJsonKey('drivers', ownerKey, []), drivers)
    assert.equal(getState().drivers[ownerKey], undefined, 'Store에 이 owner의 drivers가 새로 생기면 안 된다')
    assert.equal(countOf('driver_links', 'update'), 0)
    assert.equal(hasPendingOps(ownerKey), false)
    assert.doesNotMatch(result.toast, /연동 중으로 바꿨습니다/)
    endCloudSession()
  })

  test('failed hydration 상태에서 기사 삭제 시도: Store 유지, localStorage 유지, 서버 호출 0회, 성공 토스트 없음', async () => {
    const ownerKey = 'dma-driver-delete-failed'
    beginFailed('user-1', ownerKey)
    const drivers = asDrivers([{ id: 'drv-1', name: '기사', supabaseId: 601, status: 'pending' }])
    writeJsonKey('drivers', ownerKey, drivers)

    const result = await requestDriverDeletion({ ownerKey, userId: 'user-1', drivers, driverId: 'drv-1', cloud: true })

    assert.deepEqual(result.drivers, drivers)
    assert.deepEqual(readJsonKey('drivers', ownerKey, []), drivers)
    assert.equal(countOf('driver_links', 'delete'), 0)
    assert.equal(hasPendingOps(ownerKey), false)
    assert.doesNotMatch(result.toast, /초대를 삭제했습니다/)
    endCloudSession()
  })

  test('ready 상태에서 상태변경 성공: driver_links.update 1회, Store 반영, 재시도 큐 없음', async () => {
    const ownerKey = 'dma-driver-status-success'
    beginReady('user-1', ownerKey)
    const drivers = asDrivers([{ id: 'drv-1', name: '기사', supabaseId: 602, status: 'pending' }])
    writeJsonKey('drivers', ownerKey, drivers)
    const expected = [{ id: 'drv-1', name: '기사', supabaseId: 602, status: 'linked' }]

    const result = await requestDriverStatusChange({ ownerKey, userId: 'user-1', drivers, driverId: 'drv-1', status: 'linked', cloud: true })

    assert.deepEqual(result.drivers, expected)
    assert.equal(countOf('driver_links', 'update'), 1)
    assert.equal(countOf('driver_links', 'insert'), 0, '새 op을 outbox에 넣지 않는다')
    assert.deepEqual(getState().drivers[ownerKey], expected, 'Store에도 새 상태가 반영돼야 한다(4대 기준 2)')
    assert.deepEqual(readJsonKey('drivers', ownerKey, []), expected, 'localStorage에도 반영돼야 한다')
    assert.equal(hasPendingOps(ownerKey), false)
    assert.match(result.toast, /연동 중으로 바꿨습니다/)
    endCloudSession()
  })

  test('ready 상태에서 삭제 성공(서버가 지운 행 1개 반환): driver_links.delete 1회, Store에서 제거, 재시도 큐 없음', async () => {
    const ownerKey = 'dma-driver-delete-success'
    beginReady('user-1', ownerKey)
    const drivers = asDrivers([{ id: 'drv-1', name: '기사', supabaseId: 610, status: 'pending' }])
    writeJsonKey('drivers', ownerKey, drivers)
    handlers.driver_links = { delete: () => ({ data: [{ id: 610 }], error: null }) }

    const result = await requestDriverDeletion({ ownerKey, userId: 'user-1', drivers, driverId: 'drv-1', cloud: true })

    assert.deepEqual(result.drivers, [])
    assert.equal(countOf('driver_links', 'delete'), 1)
    assert.deepEqual(getState().drivers[ownerKey], [], 'Store에서도 제거돼야 한다')
    assert.deepEqual(readJsonKey('drivers', ownerKey, []), [], 'localStorage에서도 제거돼야 한다')
    assert.equal(hasPendingOps(ownerKey), false)
    assert.match(result.toast, /초대를 삭제했습니다/)
    endCloudSession()
  })

  test('슬라이스 B 보완 — delete가 0행이면(이미 없음/RLS): Fail-Fast 토스트, Store/localStorage 유지, 성공 토스트 없음', async () => {
    const ownerKey = 'dma-driver-delete-zero-rows'
    beginReady('user-1', ownerKey)
    const drivers = asDrivers([{ id: 'drv-1', name: '기사', supabaseId: 611, status: 'pending' }])
    writeJsonKey('drivers', ownerKey, drivers)
    handlers.driver_links = { delete: () => ({ data: [], error: null }) } // 삭제됐지만 0행

    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    const result = await requestDriverDeletion({ ownerKey, userId: 'user-1', drivers, driverId: 'drv-1', cloud: true })
    unsubscribe()

    assert.equal(result.toast, FAIL_FAST_TOAST, '0행 삭제는 성공이 아니다 — Fail-Fast 토스트')
    assert.doesNotMatch(result.toast, /삭제했습니다/)
    assert.equal(countOf('driver_links', 'delete'), 1)
    assert.equal(getState().drivers[ownerKey], undefined, 'Store에 이 owner의 drivers가 새로 생기면 안 된다')
    assert.deepEqual(readJsonKey('drivers', ownerKey, []), drivers, 'localStorage도 저장 전 값이어야 한다')
    assert.equal(hasPendingOps(ownerKey), false)
    assert.equal(notifyCount, 0)
    endCloudSession()
  })

  test('ready + 서버 throw: 상태변경 Fail-Fast 토스트, update 1회, hasPendingOps false, Store 저장 전 값', async () => {
    const ownerKey = 'dma-driver-status-throw'
    beginReady('user-1', ownerKey)
    const drivers = asDrivers([{ id: 'drv-1', name: '기사', supabaseId: 603, status: 'pending' }])
    writeJsonKey('drivers', ownerKey, drivers)
    handlers.driver_links = { update: () => { throw new Error('network down') } }

    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    const result = await requestDriverStatusChange({ ownerKey, userId: 'user-1', drivers, driverId: 'drv-1', status: 'linked', cloud: true })
    unsubscribe()

    assert.equal(result.toast, FAIL_FAST_TOAST)
    assert.equal(countOf('driver_links', 'update'), 1)
    assert.equal(hasPendingOps(ownerKey), false)
    assert.equal(getState().drivers[ownerKey], undefined, 'Store에 이 owner의 drivers가 새로 생기면 안 된다')
    assert.deepEqual(readJsonKey('drivers', ownerKey, []), drivers, 'localStorage도 저장 전 값이어야 한다')
    assert.equal(notifyCount, 0)
    endCloudSession()
  })

  test('ready + { data: null, error }: 삭제 Fail-Fast 토스트, delete 1회, hasPendingOps false, Store 저장 전 값', async () => {
    const ownerKey = 'dma-driver-delete-dataerror'
    beginReady('user-1', ownerKey)
    const drivers = asDrivers([{ id: 'drv-1', name: '기사', supabaseId: 604, status: 'linked' }])
    writeJsonKey('drivers', ownerKey, drivers)
    handlers.driver_links = { delete: () => ({ data: null, error: { message: 'RLS violation' } }) }

    const result = await requestDriverDeletion({ ownerKey, userId: 'user-1', drivers, driverId: 'drv-1', cloud: true })

    assert.equal(result.toast, FAIL_FAST_TOAST)
    assert.equal(countOf('driver_links', 'delete'), 1)
    assert.equal(hasPendingOps(ownerKey), false)
    assert.equal(getState().drivers[ownerKey], undefined)
    assert.deepEqual(readJsonKey('drivers', ownerKey, []), drivers, 'localStorage도 저장 전 값이어야 한다')
    endCloudSession()
  })

  test('세션 전환: update await 이후 로그아웃하면 Store/localStorage에 반영하지 않는다', async () => {
    const ownerKey = 'dma-driver-status-epoch'
    beginReady('user-1', ownerKey)
    const drivers = asDrivers([{ id: 'drv-1', name: '기사', supabaseId: 605, status: 'pending' }])
    writeJsonKey('drivers', ownerKey, drivers)

    let releaseUpdate
    const gate = new Promise((resolve) => { releaseUpdate = resolve })
    handlers.driver_links = { update: () => gate.then(() => ({ data: null, error: null })) }

    const promise = requestDriverStatusChange({ ownerKey, userId: 'user-1', drivers, driverId: 'drv-1', status: 'linked', cloud: true })
    await wait(10)
    assert.equal(countOf('driver_links', 'update'), 1, 'update가 이미 나갔어야 한다')

    endCloudSession() // 응답 대기 중 로그아웃한다.
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    releaseUpdate()
    await promise
    unsubscribe()

    assert.equal(notifyCount, 0, '로그아웃 이후 이 시도가 Store에 아무 반영도 하면 안 된다')
    assert.equal(getState().drivers[ownerKey], undefined, 'Store에 이 owner의 drivers가 새로 생기면 안 된다')
    assert.deepEqual(readJsonKey('drivers', ownerKey, []), drivers, 'localStorage도 원래 값 그대로여야 한다')
    assert.equal(hasPendingOps(ownerKey), false)
  })

  test('cloud:false(로컬 전용)면 hydration 상태와 무관하게 로컬만 반영한다', async () => {
    const ownerKey = 'dma-driver-guest'
    beginFailed('user-1', ownerKey) // failed여도 cloud:false면 영향 없어야 한다
    const drivers = asDrivers([{ id: 'drv-1', name: '기사', status: 'pending' }])
    writeJsonKey('drivers', ownerKey, drivers)

    const result = await requestDriverStatusChange({ ownerKey, userId: 'user-1', drivers, driverId: 'drv-1', status: 'linked', cloud: false })
    assert.deepEqual(result.drivers, [{ id: 'drv-1', name: '기사', status: 'linked' }])
    assert.equal(countOf('driver_links', 'update'), 0)
    endCloudSession()
  })

  test('supabaseId 없는 로컬 전용 항목은 cloud:true여도 서버 없이 로컬만 삭제한다', async () => {
    const ownerKey = 'dma-driver-localonly-delete'
    beginReady('user-1', ownerKey)
    const drivers = asDrivers([{ id: 'drv-local', name: '로컬기사', status: 'pending' }])
    writeJsonKey('drivers', ownerKey, drivers)

    const result = await requestDriverDeletion({ ownerKey, userId: 'user-1', drivers, driverId: 'drv-local', cloud: true })
    assert.deepEqual(result.drivers, [])
    assert.equal(countOf('driver_links', 'delete'), 0)
    assert.match(result.toast, /초대를 삭제했습니다/)
    endCloudSession()
  })
})

const RPC_FN = 'upsert_driver_link_idempotent'

describe('requestDriverInviteSave — 슬라이스 A: outbox 없이 RPC 직접 1회(Fail-Fast)', () => {
  test('failed hydration: 저장을 막고 로컬/원격에 아무 것도 안 남긴다', async () => {
    const ownerKey = 'dma-invite-failed'
    beginFailed('user-1', ownerKey)
    const items = [{ id: 'drv-new', name: '박기사', vehicleNumber: '77가7777', startDate: '2026-08-01', endDate: '', inviteCode: '555555' }]

    const result = await requestDriverInviteSave({ ownerKey, userId: 'user-1', items, editingId: null, cars: [] })

    assert.ok(result.blocked)
    assert.equal(countOf('driver_links', 'insert'), 0)
    assert.equal(countOf('rpc', RPC_FN), 0)
    assert.equal(readJsonKey('drivers', ownerKey, []).length, 0, 'failed 상태에서는 localStorage에도 안 남아야 한다')
    endCloudSession()
  })

  test('성공: driver_links.insert 0, rpc 1, Store/result.items에 서버 id, hasPendingOps false', async () => {
    const ownerKey = 'dma-invite-success'
    beginReady('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '77가7777', type: 'sub', supabaseId: 800 }]
    writeJsonKey('cars', ownerKey, cars)
    handlers.rpc = {
      [RPC_FN]: () => ({ data: [{ id: 950, invite_code: '555555', assignment_start: '2026-08-01', assignment_end: null, status: 'pending' }], error: null }),
    }
    const items = [{ id: 'drv-new', name: '박기사', vehicleNumber: '77가7777', startDate: '2026-08-01', endDate: '', inviteCode: '555555' }]

    const result = await requestDriverInviteSave({ ownerKey, userId: 'user-1', items, editingId: null, cars })

    assert.equal(result.blocked, null)
    assert.match(result.toast, /기사 초대를 저장했습니다/)
    assert.equal(countOf('driver_links', 'insert'), 0)
    assert.equal(countOf('rpc', RPC_FN), 1)
    const saved = result.items.find((item) => item.id === 'drv-new')
    assert.equal(saved?.supabaseId, 950, 'result.items에 서버 id가 반영돼야 한다')
    const inStore = getState().drivers[ownerKey]
    assert.ok(Array.isArray(inStore) && inStore.some((item) => item.supabaseId === 950), 'Store에도 서버 id가 반영돼야 한다(4대 기준 2)')
    const stored = readJsonKey('drivers', ownerKey, [])
    assert.ok(Array.isArray(stored) && stored.length === 1, 'localStorage에도 1건만 저장돼야 한다')
    assert.equal(hasPendingOps(ownerKey), false)
    endCloudSession()
  })

  test('RPC { data: null, error }: 지정 Fail-Fast 토스트, insert 0, outbox 비어 있음, Store가 실패 전 값', async () => {
    const ownerKey = 'dma-invite-rpc-error'
    beginReady('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '77가7777', type: 'sub', supabaseId: 803 }]
    writeJsonKey('cars', ownerKey, cars)
    handlers.rpc = { [RPC_FN]: () => ({ data: null, error: { message: 'RLS violation' } }) }
    const items = [{ id: 'drv-err', name: '박기사', vehicleNumber: '77가7777', startDate: '2026-08-01', endDate: '', inviteCode: '888888' }]

    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    const result = await requestDriverInviteSave({ ownerKey, userId: 'user-1', items, editingId: null, cars })
    unsubscribe()

    assert.equal(result.toast, FAIL_FAST_TOAST, 'RPC error 시 토스트가 정확히 지정 문구여야 한다')
    assert.equal(result.blocked, FAIL_FAST_TOAST)
    assert.equal(countOf('rpc', RPC_FN), 1)
    assert.equal(countOf('driver_links', 'insert'), 0)
    assert.equal(hasPendingOps(ownerKey), false)
    assert.equal(getState().drivers[ownerKey], undefined, 'Store에 이 owner의 drivers가 새로 생기면 안 된다')
    assert.deepEqual(readJsonKey('drivers', ownerKey, []), [], 'localStorage도 실패 전(빈) 값이어야 한다')
    assert.equal(notifyCount, 0)
    endCloudSession()
  })

  test('응답 유실 흉내 후 같은 driver.id로 재호출: rpc가 기존 행을 돌려주면 insert 0, 서버 행 1개로 취급', async () => {
    const ownerKey = 'dma-invite-idempotent'
    beginReady('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '88가8888', type: 'sub', supabaseId: 802 }]
    writeJsonKey('cars', ownerKey, cars)
    // 첫 시도가 이미 서버에 만들었다(응답만 유실). 같은 p_idempotency_key면 RPC가
    // 기존 행(id 950)을 그대로 돌려준다 — 중복 insert 없음.
    handlers.rpc = {
      [RPC_FN]: () => ({ data: [{ id: 950, invite_code: '777777', assignment_start: '2026-08-01', assignment_end: null, status: 'pending' }], error: null }),
    }
    const items = [{ id: 'drv-new-3', name: '박기사', vehicleNumber: '88가8888', startDate: '2026-08-01', endDate: '', inviteCode: '777777' }]

    const result = await requestDriverInviteSave({ ownerKey, userId: 'user-1', items, editingId: 'drv-new-3', cars })

    assert.equal(result.blocked, null)
    assert.equal(countOf('rpc', RPC_FN), 1)
    assert.equal(countOf('driver_links', 'insert'), 0, '이미 있는 행을 재사용해야지 다시 삽입하면 안 된다')
    assert.equal(countOf('driver_links', 'update'), 0, '기간/코드가 그대로면 보정 update도 없어야 한다')
    const saved = result.items.find((item) => item.id === 'drv-new-3')
    assert.equal(saved?.supabaseId, 950, '기존에 성공한 행의 id를 그대로 받아야 한다')
    endCloudSession()
  })

  test('불완전 입력(차량/시작일 없음): 기존 로컬 저장 유지, rpc 0', async () => {
    const ownerKey = 'dma-invite-incomplete'
    beginReady('user-1', ownerKey)
    const items = [{ id: 'drv-incomplete', name: '박기사' }]
    const result = await requestDriverInviteSave({ ownerKey, userId: 'user-1', items, editingId: null, cars: [] })
    assert.match(result.toast, /초대를 저장했습니다/, '차량 미할당이라도 로컬 저장 자체는 성공 토스트를 보여줘야 한다(예전 동작)')
    assert.equal(countOf('rpc', RPC_FN), 0, '클라우드 시도 자체를 안 해야 한다')
    assert.equal(countOf('driver_links', 'insert'), 0)
    assert.deepEqual(readJsonKey('drivers', ownerKey, []), items, '로컬에는 반드시 저장돼야 한다')
    endCloudSession()
  })

  test('불완전 입력인데 로컬 저장 자체가 실패하면(AGENTS §10) 예외를 던지지 않고 실패 토스트를 돌려준다', async () => {
    const ownerKey = 'dma-invite-incomplete-storage-fail'
    beginReady('user-1', ownerKey)
    const items = [{ id: 'drv-incomplete-2', name: '박기사' }]
    const domainKey = storageKeyFor('drivers', ownerKey)

    let result
    await assert.doesNotReject(async () => {
      result = await withFailingSetItem((key) => key === domainKey, () => requestDriverInviteSave({ ownerKey, userId: 'user-1', items, editingId: null, cars: [] }))
    })
    assert.match(result.toast, /실패했습니다/)
    endCloudSession()
  })

  test('배정 차량이 아직 서버에 없으면(car.supabaseId 없음): Fail-Fast 토스트, rpc 0, 차량 동기화 큐 안 돌림', async () => {
    const ownerKey = 'dma-invite-car-unsynced'
    beginReady('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '77가7777', type: 'sub' }]
    writeJsonKey('cars', ownerKey, cars)
    const items = [{ id: 'drv-x', name: '박기사', vehicleNumber: '77가7777', startDate: '2026-08-01', endDate: '', inviteCode: '111111' }]

    const result = await requestDriverInviteSave({ ownerKey, userId: 'user-1', items, editingId: null, cars })

    assert.equal(result.toast, FAIL_FAST_TOAST)
    assert.equal(countOf('rpc', RPC_FN), 0)
    assert.equal(countOf('driver_links', 'insert'), 0)
    assert.equal(countOf('vehicles', 'insert'), 0, '차량 동기화 큐를 새로 돌리면 안 된다')
    assert.equal(readJsonKey('drivers', ownerKey, []).length, 0)
    endCloudSession()
  })

  // AGENTS §9: RPC 응답 대기 중 로그아웃하면 결과를 폐기하고 Store/localStorage/
  // outbox에 아무 반영도 하지 않는다 — session은 RPC 시작 전 캡처, await 직후 재검증.
  test('RPC 응답 대기 중 로그아웃하면 결과를 폐기하고 Store/localStorage/outbox가 그대로다', async () => {
    const ownerKey = 'dma-invite-epoch-logout'
    beginReady('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '11가1111', type: 'sub', supabaseId: 900 }]
    writeJsonKey('drivers', ownerKey, [])
    const items = [{ id: 'drv-lo', name: '기사', vehicleNumber: '11가1111', startDate: '2026-08-10', endDate: '', inviteCode: '123456' }]

    let releaseRpc
    const gate = new Promise((resolve) => { releaseRpc = resolve })
    handlers.rpc = { [RPC_FN]: () => gate.then(() => ({ data: [{ id: 500 }], error: null })) }

    const savePromise = requestDriverInviteSave({ ownerKey, userId: 'user-1', items, editingId: null, cars })
    await wait(10)
    assert.equal(countOf('rpc', RPC_FN), 1, 'RPC가 이미 나갔어야 한다')

    endCloudSession() // RPC 응답을 기다리는 도중 로그아웃한다.
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    releaseRpc()
    await savePromise
    unsubscribe()

    assert.equal(notifyCount, 0, '로그아웃 이후 이 저장 시도가 Store에 아무 반영도 하면 안 된다(notify 0회)')
    assert.equal(getState().drivers[ownerKey], undefined, 'Store에 이 owner의 drivers가 새로 생기면 안 된다')
    assert.deepEqual(readJsonKey('drivers', ownerKey, []), [], 'localStorage도 원래 값 그대로여야 한다')
    assert.equal(hasPendingOps(ownerKey), false, 'outbox에도 아무것도 안 남아야 한다')
    assert.equal(countOf('driver_links', 'insert'), 0, 'insert가 없어야 한다')
    assert.equal(countOf('driver_links', 'update'), 0, '재검증 실패 뒤 보정 update가 나가면 안 된다')
  })
})

describe('실패 주입 — 직접 mutation 실행 직전 hydration이 hydrating/failed로 바뀌는 경우', () => {
  test('hydrating 상태에서는 항상 막힌다(ready만 허용)', async () => {
    const ownerKey = 'dma-vehicle-hydrating'
    beginReady('user-1', ownerKey)
    setHydration({ status: 'hydrating', userId: 'user-1', ownerKey })
    const cars = [{ id: 'car-1', number: '11가1111', supabaseId: 906 }]
    writeJsonKey('cars', ownerKey, cars)

    const result = await requestVehicleDeletion({ ownerKey, userId: 'user-1', cars, vehicleId: 'car-1' })
    assert.deepEqual(result.cars, cars)
    assert.equal(countOf('vehicles', 'delete'), 0)
    endCloudSession()
  })
})
