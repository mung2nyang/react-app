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
const { getState, setHydration, subscribe } = await import('../store/app-store.js')

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

    // 사용자 지시 6번(4차 재작업) — localStorage뿐 아니라 Store 값/notify 횟수도 검증한다.
    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    await flushMutationOutbox(ownerKey)
    unsubscribe()

    assert.equal(hasPendingOps(ownerKey), false)
    const drivers = readJsonKey('drivers', ownerKey, [])
    const driver = drivers.find((item) => item.id === 'driver-local-1')
    assert.equal(driver?.supabaseId, 800, '서버가 확정한 supabaseId가 로컬에 반영돼야 한다')
    assert.equal(driver?.inviteCode, '111222', '충돌로 재발급된 inviteCode도 반영돼야 한다')
    const storeDriver = getState().drivers[ownerKey]?.find((item) => item.id === 'driver-local-1')
    assert.equal(storeDriver?.supabaseId, 800, 'Store 상태도 서버 확정값으로 갱신돼야 한다(localStorage만 갱신되고 Store가 안 바뀌면 화면에 안 보인다)')
    assert.equal(notifyCount, 1, 'reconcile 쓰기 한 번에 notify도 정확히 한 번만 나가야 한다')
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

describe('사용자 지시 1번(4차 재작업) — 미동기화 차량이 뒤늦게 동기화된 뒤 발견된 배정 충돌은 낙관적 값을 롤백한다', () => {
  test('커밋 시점엔 차량이 미동기화라 사전 충돌검사를 못 걸렀지만, flush 중 동기화된 뒤 겹침이 발견되면 로컬 drivers/outbox가 원자적으로 롤백·정리된다', async () => {
    resetHandlers()
    resetOutboxQueuesForTests()
    const ownerKey = 'outboxflush-unsynced-car-conflict'
    beginReadySession('user-1', ownerKey)
    writeJsonKey('cars', ownerKey, [{ id: 'car-local', number: '99자9999', type: 'sub' }]) // 커밋 시점: 로컬 전용(supabaseId 없음).
    const previousDriver = { id: 'driver-local-5', name: '기존기사', vehicleNumber: '', startDate: '', endDate: '', inviteCode: '', status: 'pending' }
    writeJsonKey('drivers', ownerKey, [{ ...previousDriver, vehicleNumber: '99자9999', startDate: '2026-08-01', endDate: '', inviteCode: '777888' }]) // 낙관적으로 이미 반영된 상태.

    handlers.vehicles = {
      select: () => ({ data: [], error: null }),
      insert: () => ({ data: { id: 950 }, error: null }), // flush 도중 syncVehicles가 이 차량을 동기화한다.
    }
    handlers.driver_links = {
      select: () => ({ data: [{ id: 700, vehicle_id: 950, assignment_start: '2026-07-25', assignment_end: '2026-08-10', status: 'pending', driver_id: null }], error: null }),
    }

    seedOp(ownerKey, buildMutationOp({
      ownerKey, userId: 'user-1', resourceType: 'driverLink', resourceId: 'driver-local-5', operation: 'upsert',
      payload: {
        supabaseId: null, vehicleNumber: '99자9999', startDate: '2026-08-01', endDate: '',
        inviteCode: '777888', previousDriverSnapshot: previousDriver,
      },
      sessionEpoch: 1,
    }))

    let notifyCount = 0
    const unsubscribe = subscribe(() => { notifyCount += 1 })
    await flushMutationOutbox(ownerKey)
    unsubscribe()

    assert.equal(hasPendingOps(ownerKey), false, '확정 실패는 outbox에서 제거돼야 한다(영원히 재시도하면 안 된다)')
    const drivers = readJsonKey('drivers', ownerKey, [])
    assert.deepEqual(drivers.find((item) => item.id === 'driver-local-5'), previousDriver, '낙관적으로 반영했던 배정 값이 수정 전 스냅샷으로 롤백돼야 한다(성공한 것처럼 남으면 안 된다)')
    const storeDriver = getState().drivers[ownerKey]?.find((item) => item.id === 'driver-local-5')
    assert.deepEqual(storeDriver, previousDriver, 'Store도 함께 롤백돼야 한다')
    assert.equal(notifyCount, 1, '롤백+outbox 제거가 원자적 쓰기 한 번으로 끝나 notify도 한 번만 나가야 한다')
    endCloudSession()
  })
})

describe('실패 주입 — 다단계 삭제 도중 로그아웃 (사용자 지시 2번)', () => {
  test('차량 삭제 자식 테이블 처리 중 로그아웃하면, 이후 단계(daily_logs/vehicles) 원격 호출이 0회이고 op이 보존된다', async () => {
    resetHandlers()
    resetOutboxQueuesForTests()
    const ownerKey = 'outboxflush-delete-midstep-logout'
    beginReadySession('user-1', ownerKey)

    let releaseChildren
    const gate = new Promise((resolve) => { releaseChildren = resolve })
    handlers.transport_details = { delete: () => gate.then(() => ({ data: null, error: null })) }
    const op = seedOp(ownerKey, buildTombstoneOp({ ownerKey, userId: 'user-1', resourceType: 'vehicle', resourceId: 510, operation: 'delete', sessionEpoch: 1 }))

    const flushPromise = flushMutationOutbox(ownerKey)
    await wait(10)
    endCloudSession() // 자식 테이블 delete(Promise.all)가 아직 안 끝난 상태에서 로그아웃한다.
    releaseChildren()
    await flushPromise

    assert.equal(countOf('daily_logs', 'delete'), 0, '로그아웃 이후 단계는 원격 호출조차 나가면 안 된다')
    assert.equal(countOf('vehicles', 'delete'), 0, '마지막 단계(vehicles 본체 삭제)도 절대 나가면 안 된다')
    assert.equal(hasPendingOps(ownerKey), true, 'op이 그대로 보존돼야 한다(제거되면 안 된다)')
    assert.equal(getPendingOps(ownerKey)[0].id, op.id)
  })
})

describe('멱등성 조회 실패는 retryable로 처리하고 insert하지 않는다 (사용자 지시 4번)', () => {
  test('findExistingDriverLinkInsert 조회가 { data:null, error }를 반환하면 insert를 시도하지 않고 op이 남는다', async () => {
    resetHandlers()
    resetOutboxQueuesForTests()
    const ownerKey = 'outboxflush-idempotency-query-fail'
    beginReadySession('user-1', ownerKey)
    writeJsonKey('cars', ownerKey, [{ id: 'car-local', number: '77하7777', type: 'sub', supabaseId: 700 }])
    handlers.vehicles = { select: () => ({ data: [], error: null }) }
    // 멱등성 조회(findExistingDriverLinkInsert, 1번째 select)만 실패시키고, 겹침
    // 검사(findOverlappingDriverLinkOnSupabase, 2번째 select)는 정상(겹침 없음)으로
    // 둔다 — 그래야 "멱등성 조회 오류를 null로 삼켜 insert까지 진행하는" 회귀를
    // 겹침 검사 쪽의(원래도 있던) 별도 에러 처리와 구분해서 정확히 잡아낼 수 있다.
    let selectCalls = 0
    handlers.driver_links = {
      select: () => {
        selectCalls += 1
        if (selectCalls === 1) return { data: null, error: { message: 'connection reset' } }
        return { data: [], error: null }
      },
    }

    seedOp(ownerKey, buildMutationOp({
      ownerKey, userId: 'user-1', resourceType: 'driverLink', resourceId: 'driver-local-3', operation: 'upsert',
      payload: { supabaseId: null, vehicleNumber: '77하7777', startDate: '2026-08-01', endDate: '', inviteCode: '555666' },
      sessionEpoch: 1,
    }))

    await flushMutationOutbox(ownerKey)

    assert.equal(countOf('driver_links', 'insert'), 0, '있는지 없는지 확실치 않은 상태로 insert를 시도하면 안 된다')
    assert.equal(hasPendingOps(ownerKey), true, '조회 실패는 retryable — outbox에 남아 다음 flush가 다시 조회부터 시도해야 한다')
    endCloudSession()
  })
})

describe('사용자 지시 8번(4차 재작업) — invite code 재발급 + 응답 유실이 겹쳐도 서버 행은 1개로 수렴한다', () => {
  test('23505로 코드가 재발급된 뒤 응답이 유실돼도, 재시도에서 새로 insert하지 않아 서버 행이 정확히 1개다', async () => {
    resetHandlers()
    resetOutboxQueuesForTests()
    const ownerKey = 'outboxflush-invite-code-regen-lost'
    beginReadySession('user-1', ownerKey)
    writeJsonKey('cars', ownerKey, [{ id: 'car-local', number: '88아8888', type: 'sub', supabaseId: 800 }])
    handlers.vehicles = { select: () => ({ data: [], error: null }) }

    const serverRows = [] // 가짜 driver_links 테이블 — 실제로 커밋된 행만 여기 쌓인다.
    let insertAttempt = 0
    handlers.driver_links = {
      select: () => ({ data: serverRows, error: null }),
      insert: (row) => {
        insertAttempt += 1
        if (insertAttempt === 1) return { data: null, error: { code: '23505', message: 'duplicate invite_code' } }
        // 재발급된 코드로 두 번째 시도 — 서버에는 실제로 커밋되지만 응답이
        // "유실"된 것처럼 클라이언트에는 일반 네트워크 에러로 보인다.
        serverRows.push({ id: 900, vehicle_id: 800, assignment_start: '2026-08-01', assignment_end: null, status: 'pending', invite_code: row.invite_code, driver_id: null })
        return { data: null, error: { message: 'network dropped after commit' } }
      },
    }

    seedOp(ownerKey, buildMutationOp({
      ownerKey, userId: 'user-1', resourceType: 'driverLink', resourceId: 'driver-local-4', operation: 'upsert',
      payload: { supabaseId: null, vehicleNumber: '88아8888', startDate: '2026-08-01', endDate: '', inviteCode: '111111' },
      sessionEpoch: 1,
    }))

    await flushMutationOutbox(ownerKey) // 1차: 23505 → 재발급 → 서버는 성공하지만 응답 유실로 클라이언트는 실패로 인식.
    assert.equal(serverRows.length, 1, '서버에는 정확히 1개의 행만 커밋돼 있어야 한다')

    await flushMutationOutbox(ownerKey) // 2차(재시도): 원래 코드(111111)로 조회하니 자연키가 안 맞아 못 찾는다 —
    // 알려진 한계(마이그레이션 필요, supabase/migrations/0001_driver_links_idempotency_key.sql
    // 참고): op.id 기반 불변 idempotency_key가 없어 "내 이전 성공"으로 못 알아보고
    // 겹침으로 오판해 확정 실패 처리한다. 다만 그 안전장치(겹침 검사) 덕분에 절대
    // 다시 insert하지는 않는다 — 서버 행 중복은 이 상태에서도 발생하지 않는다.
    assert.equal(serverRows.length, 1, '재시도에서도 새 insert가 일어나면 안 된다 — 서버 행은 여전히 1개여야 한다')
    assert.equal(countOf('driver_links', 'insert'), 2, '1차 시도(원래 코드 충돌 + 재발급 성공) 2번 외에 재시도에서 추가 insert가 없어야 한다')
    endCloudSession()
  })
})

describe('재감사 항목 1 — driverLink/upsert가 확정 전 여러 번 병합돼도 최초 롤백 앵커를 유지한다', () => {
  test('기존 기사 A→B→C로 편집된 뒤 확정 실패하면 최초 A로 복원된다(B/C로 남으면 안 된다)', async () => {
    resetHandlers()
    resetOutboxQueuesForTests()
    const ownerKey = 'outboxflush-merge-chain-existing'
    beginReadySession('user-1', ownerKey)
    const driverId = 'driver-chain-1'
    const A = { id: driverId, name: '기사', vehicleNumber: '22나2222', startDate: '2026-08-01', endDate: '', inviteCode: '111111', status: 'pending', supabaseId: 500 }
    const B = { ...A, startDate: '2026-08-05' }
    writeJsonKey('drivers', ownerKey, [A]) // 서버가 이미 확정한 상태(A)를 로컬에 반영해 둔 상태로 시작.
    writeJsonKey('cars', ownerKey, [{ id: 'car-1', number: '22나2222', type: 'sub', supabaseId: 700 }])

    const opAB = buildMutationOp({
      ownerKey, userId: 'user-1', resourceType: 'driverLink', resourceId: driverId, operation: 'upsert',
      payload: { supabaseId: 500, vehicleNumber: '22나2222', startDate: '2026-08-05', endDate: '', inviteCode: '111111', previousDriverSnapshot: A },
      sessionEpoch: 1,
    })
    const plan1 = planOutboxAppend(ownerKey, opAB)
    writeAllOrNothing([{ key: plan1.key, value: plan1.value }])

    // 확정되기 전에 다시 편집(B→C) — mergeOutboxOp이 최초 op(opAB)의 id/A 스냅샷을 이어받아야 한다.
    const opBC = buildMutationOp({
      ownerKey, userId: 'user-1', resourceType: 'driverLink', resourceId: driverId, operation: 'upsert',
      payload: { supabaseId: 500, vehicleNumber: '22나2222', startDate: '2026-08-10', endDate: '', inviteCode: '111111', previousDriverSnapshot: B },
      sessionEpoch: 1,
    })
    const plan2 = planOutboxAppend(ownerKey, opBC)
    writeAllOrNothing([{ key: plan2.key, value: plan2.value }])
    assert.equal(plan2.effectiveOp.id, opAB.id, '최초 op의 id를 이어받아야 한다')
    assert.deepEqual(plan2.effectiveOp.payload.previousDriverSnapshot, A, '롤백 앵커는 A를 유지해야 한다')
    assert.equal(getPendingOps(ownerKey).length, 1, '두 번 편집해도 outbox엔 병합된 op 1개만 있어야 한다')

    // 서버가 최종(C) 시도에서 겹침을 발견해 확정 실패로 판정한다.
    handlers.vehicles = { select: () => ({ data: [], error: null }) }
    handlers.driver_links = { select: () => ({ data: [{ id: 999, vehicle_id: 700, assignment_start: '2026-08-08', assignment_end: '2026-08-20', status: 'pending', driver_id: null }], error: null }) }

    await flushMutationOutbox(ownerKey)

    assert.equal(hasPendingOps(ownerKey), false)
    const drivers = readJsonKey('drivers', ownerKey, [])
    assert.deepEqual(drivers.find((item) => item.id === driverId), A, 'A→B→C 후 확정 실패면 최초 A로 정확히 복원돼야 한다')
    endCloudSession()
  })

  test('신규 기사 생성 직후 재편집한 뒤 확정 실패하면 완전히 제거된다(중간 편집값이 안 남는다)', async () => {
    resetHandlers()
    resetOutboxQueuesForTests()
    const ownerKey = 'outboxflush-merge-chain-new'
    beginReadySession('user-1', ownerKey)
    const driverId = 'driver-chain-2'
    writeJsonKey('drivers', ownerKey, []) // 신규 생성이라 원래 이 기사는 없었다.
    writeJsonKey('cars', ownerKey, [{ id: 'car-1', number: '33다3333', type: 'sub', supabaseId: 800 }])

    const opCreate = buildMutationOp({
      ownerKey, userId: 'user-1', resourceType: 'driverLink', resourceId: driverId, operation: 'upsert',
      payload: { supabaseId: null, vehicleNumber: '33다3333', startDate: '2026-09-01', endDate: '', inviteCode: '222222', previousDriverSnapshot: null },
      sessionEpoch: 1,
    })
    const plan1 = planOutboxAppend(ownerKey, opCreate)
    writeAllOrNothing([{ key: plan1.key, value: plan1.value }])

    // 재편집 시점에 previousDriverSnapshot을 (실수로든 아니든) 값이 있는 것으로
    // 잘못 계산해 넘겨도, 병합은 최초(null)를 그대로 유지해야 한다 — 신규 생성
    // 의도는 "실패하면 완전히 없었던 일이 된다"이다.
    const wrongSnapshot = { id: driverId, name: '착오로 들어간 값', vehicleNumber: '33다3333', startDate: '2026-09-01', endDate: '', inviteCode: '222222', status: 'pending' }
    const opEdit = buildMutationOp({
      ownerKey, userId: 'user-1', resourceType: 'driverLink', resourceId: driverId, operation: 'upsert',
      payload: { supabaseId: null, vehicleNumber: '33다3333', startDate: '2026-09-05', endDate: '', inviteCode: '222222', previousDriverSnapshot: wrongSnapshot },
      sessionEpoch: 1,
    })
    const plan2 = planOutboxAppend(ownerKey, opEdit)
    writeAllOrNothing([{ key: plan2.key, value: plan2.value }])
    assert.equal(plan2.effectiveOp.id, opCreate.id)
    assert.equal(plan2.effectiveOp.payload.previousDriverSnapshot, null, '신규 생성이었다는 사실(null)이 유지돼야 한다')

    handlers.vehicles = { select: () => ({ data: [], error: null }) }
    handlers.driver_links = { select: () => ({ data: [{ id: 999, vehicle_id: 800, assignment_start: '2026-09-03', assignment_end: '2026-09-10', status: 'pending', driver_id: null }], error: null }) }

    await flushMutationOutbox(ownerKey)

    assert.equal(hasPendingOps(ownerKey), false)
    const drivers = readJsonKey('drivers', ownerKey, [])
    assert.equal(drivers.find((item) => item.id === driverId), undefined, '신규 생성 시도가 확정 실패하면 완전히 제거돼야 한다(중간 편집값이 남으면 안 된다)')
    endCloudSession()
  })
})
