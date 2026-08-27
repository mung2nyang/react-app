import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf } = createFakeSupabase()
mock.module('../supabaseClient.js', { exports: { supabase: fakeSupabase } })

const { flushMutationOutbox, resetOutboxQueuesForTests } = await import('./outboxFlush.js')
const { beginSessionEpoch, endCloudSession } = await import('./cloudSession.js')
const { buildTombstoneOp, buildMutationOp, getPendingOps, hasPendingOps, planOutboxAppend } = await import('./mutationOutbox.js')
const { writeAllOrNothing } = await import('../store/atomicPersist.js')
const { readJsonKey, writeJsonKey } = await import('../store/persist.js')
const { setHydration } = await import('../store/app-store.js')

function seedOp(ownerKey, op) {
  const { key, value } = planOutboxAppend(ownerKey, op)
  writeAllOrNothing([{ key, value }])
  return op
}

// executeOp이 부르는 directMutations.js의 모든 실행기는 assertCloudWriteReady()를
// 거친다 — session뿐 아니라 hydration.status === 'ready'까지 요구한다. 세션만
// beginSessionEpoch로 잡고 이걸 빼먹으면 모든 실행기가 "준비되지 않았습니다"로
// 던져서 outbox가 절대 안 비워진다(실제로 이 파일 작성 중 이 버그를 직접 겪었다).
function beginReadySession(userId, ownerKey) {
  beginSessionEpoch(userId, ownerKey)
  setHydration({ status: 'ready', userId, ownerKey })
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('outboxFlush — 성공하면 outbox에서 제거된다', () => {
  test('차량 삭제 tombstone이 성공하면 outbox가 비워진다', async () => {
    resetHandlers()
    resetOutboxQueuesForTests()
    const ownerKey = 'outboxflush-success'
    beginReadySession('user-1', ownerKey)
    seedOp(ownerKey, buildTombstoneOp({ ownerKey, userId: 'user-1', resourceType: 'vehicle', resourceId: 501, operation: 'delete', sessionEpoch: 1 }))

    await flushMutationOutbox(ownerKey)

    assert.equal(hasPendingOps(ownerKey), false)
    assert.equal(countOf('vehicles', 'delete'), 1)
    endCloudSession()
  })
})

describe('실패 주입 — Supabase가 throw하면 outbox에 남는다', () => {
  test('vehicles.delete가 던지면 op이 그대로 outbox에 남고, 다음 flush에서 재시도된다', async () => {
    resetHandlers()
    resetOutboxQueuesForTests()
    const ownerKey = 'outboxflush-throw'
    beginReadySession('user-1', ownerKey)
    handlers.vehicles = { delete: () => { throw new Error('network down') } }
    const op = seedOp(ownerKey, buildTombstoneOp({ ownerKey, userId: 'user-1', resourceType: 'vehicle', resourceId: 502, operation: 'delete', sessionEpoch: 1 }))

    await flushMutationOutbox(ownerKey)
    assert.equal(hasPendingOps(ownerKey), true)
    assert.equal(getPendingOps(ownerKey)[0].id, op.id)

    handlers.vehicles = {} // 다음 시도는 성공하도록
    await flushMutationOutbox(ownerKey)
    assert.equal(hasPendingOps(ownerKey), false, '재시도가 성공하면 그제서야 제거돼야 한다')
    endCloudSession()
  })
})

describe('실패 주입 — Supabase가 { data:null, error }를 반환해도 outbox에 남는다', () => {
  test('vehicles.delete가 error를 반환하면(throw 아님) 던져 올리고 outbox에 남긴다', async () => {
    resetHandlers()
    resetOutboxQueuesForTests()
    const ownerKey = 'outboxflush-data-error'
    beginReadySession('user-1', ownerKey)
    handlers.vehicles = { delete: () => ({ data: null, error: { message: 'RLS violation' } }) }
    seedOp(ownerKey, buildTombstoneOp({ ownerKey, userId: 'user-1', resourceType: 'vehicle', resourceId: 503, operation: 'delete', sessionEpoch: 1 }))

    await flushMutationOutbox(ownerKey)
    assert.equal(hasPendingOps(ownerKey), true)
    endCloudSession()
  })
})

describe('멱등성 — 중간 테이블만 성공한 뒤 재시도해도 안전하다', () => {
  test('daily_logs.delete만 실패했다가 재시도로 성공하면, 앞서 이미 지워진 자식 테이블 delete가 다시 불려도(0행 삭제) 에러 없이 끝난다', async () => {
    resetHandlers()
    resetOutboxQueuesForTests()
    const ownerKey = 'outboxflush-partial-retry'
    beginReadySession('user-1', ownerKey)
    handlers.daily_logs = { delete: () => ({ data: null, error: { message: 'timeout' } }) }
    seedOp(ownerKey, buildTombstoneOp({ ownerKey, userId: 'user-1', resourceType: 'vehicle', resourceId: 504, operation: 'delete', sessionEpoch: 1 }))

    await flushMutationOutbox(ownerKey)
    assert.equal(hasPendingOps(ownerKey), true)
    assert.equal(countOf('transport_details', 'delete'), 1, '자식 테이블은 이미 지워졌다(재시도 시 다시 불려도 안전해야 한다)')

    handlers.daily_logs = {}
    await flushMutationOutbox(ownerKey)
    assert.equal(hasPendingOps(ownerKey), false)
    assert.equal(countOf('transport_details', 'delete'), 2, '재시도가 자식 테이블 delete를 다시 불러도(이미 빈 테이블) 에러 없이 통과해야 한다')
    endCloudSession()
  })
})

describe('single-flight + dirty 재실행', () => {
  test('실행 중에 flushMutationOutbox가 다시 불리면(다른 op이 추가된 상황을 흉내) 한 번 더 돌고서야 resolve한다', async () => {
    resetHandlers()
    resetOutboxQueuesForTests()
    const ownerKey = 'outboxflush-inflight'
    beginReadySession('user-1', ownerKey)

    let releaseFirst
    const gate = new Promise((resolve) => { releaseFirst = resolve })
    let vehicleDeleteCalls = 0
    handlers.vehicles = {
      delete: () => {
        vehicleDeleteCalls += 1
        if (vehicleDeleteCalls === 1) return gate.then(() => ({ data: null, error: null }))
        return { data: null, error: null }
      },
    }
    seedOp(ownerKey, buildTombstoneOp({ ownerKey, userId: 'user-1', resourceType: 'vehicle', resourceId: 505, operation: 'delete', sessionEpoch: 1 }))

    const p1 = flushMutationOutbox(ownerKey)
    await wait(10)
    assert.equal(vehicleDeleteCalls, 1)

    // 실행 중에 두 번째 op을 추가하고 flush를 한 번 더 요청한다.
    seedOp(ownerKey, buildTombstoneOp({ ownerKey, userId: 'user-1', resourceType: 'client', resourceId: 900, operation: 'delete', sessionEpoch: 1 }))
    const p2 = flushMutationOutbox(ownerKey)

    releaseFirst()
    await Promise.all([p1, p2])

    assert.equal(hasPendingOps(ownerKey), false, '두 op 모두 처리돼야 한다')
    assert.equal(countOf('clients', 'delete'), 1)
    endCloudSession()
  })
})

describe('실패 주입 — 실행 중 로그아웃/owner 전환', () => {
  test('flush 도중 로그아웃하면 남은 op은 그대로 두고 원격 호출을 멈춘다', async () => {
    resetHandlers()
    resetOutboxQueuesForTests()
    const ownerKey = 'outboxflush-logout-midflight'
    beginReadySession('user-1', ownerKey)

    let releaseFirst
    const gate = new Promise((resolve) => { releaseFirst = resolve })
    handlers.vehicles = { delete: () => gate.then(() => ({ data: null, error: null })) }
    seedOp(ownerKey, buildTombstoneOp({ ownerKey, userId: 'user-1', resourceType: 'vehicle', resourceId: 506, operation: 'delete', sessionEpoch: 1 }))
    seedOp(ownerKey, buildTombstoneOp({ ownerKey, userId: 'user-1', resourceType: 'client', resourceId: 901, operation: 'delete', sessionEpoch: 1 }))

    const flushPromise = flushMutationOutbox(ownerKey)
    await wait(10)
    endCloudSession() // 로그아웃 — 세대가 올라간다.
    releaseFirst()
    await flushPromise

    // vehicles.delete는 이미 시작된 호출이라 끝까지 갔을 수 있지만, clients.delete(두
    // 번째 op)는 세션이 바뀐 뒤라 절대 나가면 안 된다.
    assert.equal(countOf('clients', 'delete'), 0, '로그아웃 이후에는 이 owner의 남은 op을 처리하면 안 된다')
  })

  test('flush 시작 시점에 이미 다른 owner가 현재 세션이면 아예 실행하지 않는다', async () => {
    resetHandlers()
    resetOutboxQueuesForTests()
    const staleOwner = 'outboxflush-stale-owner'
    seedOp(staleOwner, buildTombstoneOp({ ownerKey: staleOwner, userId: 'user-old', resourceType: 'vehicle', resourceId: 507, operation: 'delete', sessionEpoch: 1 }))

    beginReadySession('user-current', 'outboxflush-current-owner') // 다른 owner가 현재 세션
    await flushMutationOutbox(staleOwner)

    assert.equal(countOf('vehicles', 'delete'), 0, '현재 세션과 다른 owner의 outbox는 절대 flush하면 안 된다')
    assert.equal(hasPendingOps(staleOwner), true)
    endCloudSession()
  })
})

describe('기사 초대 upsert — 성공 시 로컬에 서버 확정값을 되반영한다', () => {
  test('upsert op이 성공하면 driver_links가 돌려준 supabaseId/inviteCode로 drivers 도메인을 갱신한다', async () => {
    resetHandlers()
    resetOutboxQueuesForTests()
    const ownerKey = 'outboxflush-driver-upsert'
    beginReadySession('user-1', ownerKey)
    writeJsonKey('cars', ownerKey, [{ id: 'car-local', number: '55다5555', type: 'sub', supabaseId: 600 }])
    writeJsonKey('drivers', ownerKey, [{ id: 'driver-local-1', name: '기사', vehicleNumber: '55다5555', startDate: '2026-08-01', endDate: '', inviteCode: '999999', status: 'pending' }])
    handlers.vehicles = { select: () => ({ data: [], error: null }) }
    handlers.driver_links = {
      select: () => ({ data: [], error: null }),
      insert: () => ({ data: { id: 800, invite_code: '111222', assignment_start: '2026-08-01', assignment_end: null, status: 'pending' }, error: null }),
    }

    seedOp(ownerKey, buildMutationOp({
      ownerKey, userId: 'user-1', resourceType: 'driverLink', resourceId: 'driver-local-1', operation: 'upsert',
      payload: { supabaseId: null, vehicleNumber: '55다5555', startDate: '2026-08-01', endDate: '', inviteCode: '999999' },
      sessionEpoch: 1,
    }))

    await flushMutationOutbox(ownerKey)

    assert.equal(hasPendingOps(ownerKey), false)
    const drivers = readJsonKey('drivers', ownerKey, [])
    const driver = drivers.find((item) => item.id === 'driver-local-1')
    assert.equal(driver?.supabaseId, 800, '서버가 확정한 supabaseId가 로컬에 반영돼야 한다')
    assert.equal(driver?.inviteCode, '111222', '충돌로 재발급된 inviteCode도 반영돼야 한다')
    endCloudSession()
  })

  test('차량 동기화 자체가 실패하면(네트워크 등) 기사 upsert도 실패하고 op이 남는다', async () => {
    resetHandlers()
    resetOutboxQueuesForTests()
    const ownerKey = 'outboxflush-driver-upsert-no-vehicle'
    beginReadySession('user-1', ownerKey)
    writeJsonKey('cars', ownerKey, [{ id: 'car-local', number: '55다5555', type: 'sub' }]) // supabaseId 없음 — upsert 실행 전 syncVehicles가 먼저 동기화를 시도한다.
    handlers.vehicles = {
      select: () => ({ data: [], error: null }),
      insert: () => ({ data: null, error: { message: 'network down' } }), // 차량 동기화 자체가 실패
    }

    seedOp(ownerKey, buildMutationOp({
      ownerKey, userId: 'user-1', resourceType: 'driverLink', resourceId: 'driver-local-2', operation: 'upsert',
      payload: { supabaseId: null, vehicleNumber: '55다5555', startDate: '2026-08-01', endDate: '', inviteCode: '333444' },
      sessionEpoch: 1,
    }))

    await flushMutationOutbox(ownerKey)
    assert.equal(hasPendingOps(ownerKey), true, '차량 동기화가 실패하면 기사 초대 op도 계속 대기 상태로 남아야 한다')
    endCloudSession()
  })
})
