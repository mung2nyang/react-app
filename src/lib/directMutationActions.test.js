// Step 0-4 감사 보완 4차: 사용자 지시 6번("API 함수만 테스트하고 컴포넌트 코드상 로컬
// 유지가 보장된다고 주장하지 마라") — 이 파일은 컴포넌트가 실제로 호출하는 서비스
// 함수(requestVehicleDeletion 등)를 직접 부른다. 이게 UI가 타는 실제 코드 경로이므로,
// 여기서 검증한 것이 곧 UI 안전성 검증이다(렌더 테스트 없이도).
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

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
const { getPendingOps, hasPendingOps } = await import('./mutationOutbox.js')

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

function withFailingSetItem(shouldFail, fn) {
  const proto = Object.getPrototypeOf(localStorage)
  const original = proto.setItem
  const spy = mock.method(proto, 'setItem', function patched(key, value) {
    if (shouldFail(key)) throw new Error('quota exceeded (simulated)')
    return original.call(this, key, value)
  })
  try {
    return fn()
  } finally {
    spy.mock.restore()
  }
}

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

  test('ready 상태에서 성공: 로컬 반영 + outbox 비워짐 + 확정 성공 토스트', async () => {
    const ownerKey = 'dma-vehicle-success'
    beginReady('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '11가1111', supabaseId: 901 }]
    writeJsonKey('cars', ownerKey, cars)

    const result = await requestVehicleDeletion({ ownerKey, userId: 'user-1', cars, vehicleId: 'car-1' })

    assert.deepEqual(result.cars, [])
    assert.deepEqual(readJsonKey('cars', ownerKey, []), [])
    assert.equal(countOf('vehicles', 'delete'), 1)
    assert.equal(hasPendingOps(ownerKey), false)
    assert.match(result.toast, /삭제했습니다/)
    endCloudSession()
  })

  test('ready 상태인데 원격 삭제가 throw로 실패: 로컬은 반영되고(낙관적) durable tombstone이 남으며, 확정 성공 토스트는 아니다', async () => {
    const ownerKey = 'dma-vehicle-remote-fail'
    beginReady('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '11가1111', supabaseId: 902 }]
    writeJsonKey('cars', ownerKey, cars)
    handlers.vehicles = { delete: () => { throw new Error('network down') } }

    const result = await requestVehicleDeletion({ ownerKey, userId: 'user-1', cars, vehicleId: 'car-1' })

    assert.deepEqual(result.cars, [], '로컬은 낙관적으로 반영된다(로컬 우선 + durable tombstone 전략)')
    assert.equal(hasPendingOps(ownerKey), true, '실패한 삭제는 outbox에 durable하게 남아야 한다')
    assert.equal(getPendingOps(ownerKey)[0].resourceType, 'vehicle')
    assert.doesNotMatch(result.toast, /^차량을 삭제했습니다\.$/, '확정 성공 토스트가 아니라 대기 상태 안내여야 한다')
    endCloudSession()
  })

  test('ready 상태인데 Supabase가 { data:null, error }를 반환: 역시 outbox에 남는다', async () => {
    const ownerKey = 'dma-vehicle-data-error'
    beginReady('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '11가1111', supabaseId: 903 }]
    writeJsonKey('cars', ownerKey, cars)
    handlers.vehicles = { delete: () => ({ data: null, error: { message: 'RLS violation' } }) }

    await requestVehicleDeletion({ ownerKey, userId: 'user-1', cars, vehicleId: 'car-1' })
    assert.equal(hasPendingOps(ownerKey), true)
    endCloudSession()
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

  test('supabaseId가 없는(로컬 전용) 차량은 hydration 상태와 무관하게 항상 삭제된다', async () => {
    const ownerKey = 'dma-vehicle-local-only'
    beginFailed('user-1', ownerKey)
    const cars = [{ id: 'car-local', number: '99하9999' }]
    writeJsonKey('cars', ownerKey, cars)

    const result = await requestVehicleDeletion({ ownerKey, userId: 'user-1', cars, vehicleId: 'car-local' })
    assert.deepEqual(result.cars, [])
    assert.equal(countOf('vehicles', 'delete'), 0, '서버에 애초에 없던 차량이라 호출 자체가 없어야 한다')
    endCloudSession()
  })
})

describe('실패 주입 — 도메인+outbox 원자적 쓰기 자체가 실패하는 경우', () => {
  // 사용자 지시 10번: localStorage/outbox 저장 실패는 unhandled rejection이 아니라
  // "실패했다"는 결과값 + 토스트로 UI에 전달돼야 한다. 예전에는 여기서 throw했지만,
  // 이제는 항상 resolve하고 storageFailed로 알린다 — 그 계약이 실제로 지켜지는지,
  // 그리고 롤백/notify/서버 호출 0회 보장도 여전히 유효한지 함께 확인한다.
  test('outbox localStorage 쓰기가 실패하면 throw 없이 실패 토스트로 알리고, 도메인 값도 롤백되고 store/notify/서버 호출이 전부 0이다', async () => {
    const ownerKey = 'dma-vehicle-atomic-fail'
    beginReady('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '11가1111', supabaseId: 905 }]
    writeJsonKey('cars', ownerKey, cars)
    const carsRawBefore = localStorage.getItem(storageKeyFor('cars', ownerKey))

    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    const outboxKey = `reactPracticeMutationOutbox:${ownerKey}`

    let result
    await assert.doesNotReject(async () => {
      result = await withFailingSetItem((key) => key === outboxKey, () => requestVehicleDeletion({ ownerKey, userId: 'user-1', cars, vehicleId: 'car-1' }))
    })
    unsubscribe()

    assert.equal(result.blocked, null)
    assert.match(result.toast, /저장에 실패했습니다/)
    assert.deepEqual(result.cars, cars, '저장 실패 시 호출부에는 원래 cars를 그대로 돌려줘야 한다(유실된 것처럼 보이면 안 된다)')
    assert.equal(localStorage.getItem(storageKeyFor('cars', ownerKey)), carsRawBefore, '도메인 localStorage가 원래 값으로 롤백돼야 한다')
    assert.deepEqual(getState().cars[ownerKey], undefined, 'store에 아직 이 owner의 cars가 반영된 적 없어야 한다(이번 호출로 새로 생기면 안 된다)')
    assert.equal(notifyCount, 0)
    assert.equal(countOf('vehicles', 'delete'), 0, '로컬 저장조차 실패했으면 원격 호출로 넘어가면 안 된다')
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

  test('ready 상태에서 성공하면 서버 호출 1회, outbox 비워짐', async () => {
    const ownerKey = 'dma-client-success'
    beginReady('user-1', ownerKey)
    const clients = [{ id: 'client-1', companyName: '한진', supabaseId: 701 }]
    writeJsonKey('clients', ownerKey, clients)

    const result = await requestClientDeletion({ ownerKey, userId: 'user-1', clients, clientId: 'client-1' })
    assert.deepEqual(result.clients, [])
    assert.equal(countOf('clients', 'delete'), 1)
    assert.equal(hasPendingOps(ownerKey), false)
    endCloudSession()
  })
})

describe('requestDriverStatusChange / requestDriverDeletion — 사용자 지시 10번 필수 시나리오', () => {
  test('failed 상태에서 기사 상태변경 시도: Store 유지, localStorage 유지, 서버 호출 0회, 성공 토스트 없음', async () => {
    const ownerKey = 'dma-driver-status-failed'
    beginFailed('user-1', ownerKey)
    const drivers = [{ id: 'drv-1', name: '기사', supabaseId: 600, status: 'pending' }]
    writeJsonKey('drivers', ownerKey, drivers)

    const result = await requestDriverStatusChange({ ownerKey, userId: 'user-1', drivers, driverId: 'drv-1', status: 'linked', cloud: true })

    assert.deepEqual(result.drivers, drivers)
    assert.deepEqual(readJsonKey('drivers', ownerKey, []), drivers)
    assert.equal(countOf('driver_links', 'update'), 0)
    assert.doesNotMatch(result.toast, /연동 중으로 바꿨습니다/)
    endCloudSession()
  })

  test('failed 상태에서 기사 삭제 시도: Store 유지, localStorage 유지, 서버 호출 0회, 성공 토스트 없음', async () => {
    const ownerKey = 'dma-driver-delete-failed'
    beginFailed('user-1', ownerKey)
    const drivers = [{ id: 'drv-1', name: '기사', supabaseId: 601, status: 'pending' }]
    writeJsonKey('drivers', ownerKey, drivers)

    const result = await requestDriverDeletion({ ownerKey, userId: 'user-1', drivers, driverId: 'drv-1', cloud: true })

    assert.deepEqual(result.drivers, drivers)
    assert.deepEqual(readJsonKey('drivers', ownerKey, []), drivers)
    assert.equal(countOf('driver_links', 'delete'), 0)
    assert.doesNotMatch(result.toast, /초대를 삭제했습니다/)
    endCloudSession()
  })

  test('ready 상태에서 상태변경 성공 시 서버 호출 1회, outbox 비워짐', async () => {
    const ownerKey = 'dma-driver-status-success'
    beginReady('user-1', ownerKey)
    const drivers = [{ id: 'drv-1', name: '기사', supabaseId: 602, status: 'pending' }]
    writeJsonKey('drivers', ownerKey, drivers)

    const result = await requestDriverStatusChange({ ownerKey, userId: 'user-1', drivers, driverId: 'drv-1', status: 'linked', cloud: true })
    assert.equal(result.drivers.find((item) => item.id === 'drv-1').status, 'linked')
    assert.equal(countOf('driver_links', 'update'), 1)
    assert.equal(hasPendingOps(ownerKey), false)
    endCloudSession()
  })

  test('cloud:false(게스트/로컬)면 hydration 상태와 무관하게 로컬만 반영한다', async () => {
    const ownerKey = 'dma-driver-guest'
    beginFailed('user-1', ownerKey) // failed여도 게스트 모드는 영향 없어야 한다
    const drivers = [{ id: 'drv-1', name: '기사', status: 'pending' }]
    writeJsonKey('drivers', ownerKey, drivers)

    const result = await requestDriverStatusChange({ ownerKey, userId: 'user-1', drivers, driverId: 'drv-1', status: 'linked', cloud: false })
    assert.equal(result.drivers.find((item) => item.id === 'drv-1').status, 'linked')
    assert.equal(countOf('driver_links', 'update'), 0)
    endCloudSession()
  })
})

describe('requestDriverInviteSave — 생성/수정도 outbox를 거친다', () => {
  test('failed 상태에서는 저장을 막고 로컬에 아무 것도 안 남긴다', async () => {
    const ownerKey = 'dma-invite-failed'
    beginFailed('user-1', ownerKey)
    const items = [{ id: 'drv-new', name: '박기사', vehicleNumber: '77가7777', startDate: '2026-08-01', endDate: '', inviteCode: '555555' }]

    const result = await requestDriverInviteSave({ ownerKey, userId: 'user-1', items, editingId: null, cars: [] })

    assert.ok(result.blocked)
    assert.equal(countOf('driver_links', 'insert'), 0)
    assert.equal(readJsonKey('drivers', ownerKey, []).length, 0, 'failed 상태에서는 localStorage에도 안 남아야 한다')
    endCloudSession()
  })

  test('ready 상태에서 성공하면 서버가 확정한 값을 돌려주고 outbox가 비워진다', async () => {
    const ownerKey = 'dma-invite-success'
    beginReady('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '77가7777', type: 'sub', supabaseId: 800 }]
    writeJsonKey('cars', ownerKey, cars)
    handlers.driver_links = {
      select: () => ({ data: [], error: null }),
      insert: () => ({ data: { id: 950, invite_code: '555555', assignment_start: '2026-08-01', assignment_end: null, status: 'pending' }, error: null }),
    }
    const items = [{ id: 'drv-new', name: '박기사', vehicleNumber: '77가7777', startDate: '2026-08-01', endDate: '', inviteCode: '555555' }]

    const result = await requestDriverInviteSave({ ownerKey, userId: 'user-1', items, editingId: null, cars })

    assert.equal(result.blocked, null)
    assert.match(result.toast, /초대를 저장했습니다/)
    const saved = result.items.find((item) => item.id === 'drv-new')
    assert.equal(saved.supabaseId, 950)
    assert.equal(hasPendingOps(ownerKey), false)
    endCloudSession()
  })

  test('사용자 지시 3번 — 차량이 이미 동기화돼 있고 겹침이 있으면 확정 실패로 즉시 처리하고 로컬/outbox에 아무 것도 안 남긴다', async () => {
    const ownerKey = 'dma-invite-conflict'
    beginReady('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '77가7777', type: 'sub', supabaseId: 801 }]
    writeJsonKey('cars', ownerKey, cars)
    handlers.driver_links = {
      select: () => ({ data: [{ id: 111, assignment_start: '2026-08-01', assignment_end: null, status: 'linked', driver_id: 'other' }], error: null }),
    }
    const items = [{ id: 'drv-new-2', name: '박기사', vehicleNumber: '77가7777', startDate: '2026-08-05', endDate: '', inviteCode: '666666' }]

    const result = await requestDriverInviteSave({ ownerKey, userId: 'user-1', items, editingId: 'drv-new-2', cars })

    assert.ok(result.blocked, '확정 실패이므로 blocked가 있어야 한다(durable retry 대상이 아니다)')
    assert.doesNotMatch(result.toast, /저장했습니다/)
    assert.equal(hasPendingOps(ownerKey), false, '확정 실패는 outbox에 남으면 안 된다')
    assert.equal(readJsonKey('drivers', ownerKey, []).length, 0, '낙관적 로컬 반영도 없어야 한다')
    assert.equal(countOf('driver_links', 'insert'), 0)
    endCloudSession()
  })

  test('사용자 지시 8번 — insert 응답이 유실된 뒤(즉시 재시도) 같은 payload로 다시 저장해도 중복 삽입 없이 그 행을 그대로 쓴다', async () => {
    const ownerKey = 'dma-invite-idempotent'
    beginReady('user-1', ownerKey)
    const cars = [{ id: 'car-1', number: '88가8888', type: 'sub', supabaseId: 802 }]
    writeJsonKey('cars', ownerKey, cars)
    // 첫 시도가 이미 서버에 성공적으로 삽입했다고 가정한다(응답만 유실됨) — idempotency
    // 조회(.maybeSingle())가 그 행을 그대로 돌려준다. 이 owner-prior 경로는 겹침 조회
    // (배열 기대)까지 가지 않고 여기서 바로 끝나므로, 단일 객체 모양으로 응답해도 된다.
    handlers.driver_links = {
      select: () => ({ data: { id: 950, vehicle_id: 802, assignment_start: '2026-08-01', assignment_end: null, invite_code: '777777', status: 'pending', driver_id: null }, error: null }),
    }
    const items = [{ id: 'drv-new-3', name: '박기사', vehicleNumber: '88가8888', startDate: '2026-08-01', endDate: '', inviteCode: '777777' }]

    const result = await requestDriverInviteSave({ ownerKey, userId: 'user-1', items, editingId: 'drv-new-3', cars })

    assert.equal(result.blocked, null, '내 이전 삽입을 겹침으로 오인해 확정 실패시키면 안 된다')
    assert.equal(countOf('driver_links', 'insert'), 0, '이미 있는 행을 재사용해야지 다시 삽입하면 안 된다')
    const saved = result.items.find((item) => item.id === 'drv-new-3')
    assert.equal(saved.supabaseId, 950, '기존에 성공한 행의 id를 그대로 받아야 한다')
    endCloudSession()
  })

  test('입력이 불완전해도(차량/시작일 없음) 사용자 지시 2번대로 로컬에는 항상 저장되고 저장 토스트가 뜬다', async () => {
    const ownerKey = 'dma-invite-incomplete'
    beginReady('user-1', ownerKey)
    const items = [{ id: 'drv-incomplete', name: '박기사' }]
    const result = await requestDriverInviteSave({ ownerKey, userId: 'user-1', items, editingId: null, cars: [] })
    assert.match(result.toast, /초대를 저장했습니다/, '차량 미할당이라도 로컬 저장 자체는 성공 토스트를 보여줘야 한다(예전 동작)')
    assert.equal(countOf('driver_links', 'insert'), 0, '클라우드 시도 자체를 안 해야 한다')
    assert.deepEqual(readJsonKey('drivers', ownerKey, []), items, '로컬에는 반드시 저장돼야 한다 — 이게 이번에 고친 회귀다')
    endCloudSession()
  })

  test('입력이 불완전한데 로컬 저장 자체가 실패하면(사용자 지시 10번) 예외를 던지지 않고 실패 토스트를 돌려준다', async () => {
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
