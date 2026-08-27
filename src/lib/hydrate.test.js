import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { createFakeSupabase, wait } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf, emptyOkHandlers } = createFakeSupabase()
mock.module('../supabaseClient.js', { exports: { supabase: fakeSupabase } })

const { hydrateFromSupabase, retryHydrate } = await import('./hydrate.js')
const { endCloudSession } = await import('./cloudSession.js')
const { getState } = await import('../store/app-store.js')
const { markDirty, getDirtyDomains } = await import('./dirtyJournal.js')
const { readJsonKey, writeJsonKey } = await import('../store/persist.js')
const { buildTombstoneOp, buildMutationOp, planOutboxAppend } = await import('./mutationOutbox.js')
const { writeAllOrNothing } = await import('../store/atomicPersist.js')

function seedOutboxOp(ownerKey, op) {
  const { key, value } = planOutboxAppend(ownerKey, op)
  writeAllOrNothing([{ key, value }])
}

describe('hydrateFromSupabase — 조회 실패는 전부 failed로, 부분 반영 없음', () => {
  test('profiles 조회가 실패하면 status가 failed로 남고, 로컬/store는 그대로다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    handlers.profiles = { select: () => ({ data: null, error: { message: 'profiles down' } }) }
    const ownerKey = 'audit4-profiles-fail'
    writeJsonKey('cars', ownerKey, [{ id: 'seed-car', number: '11가1111' }])

    await assert.rejects(() => hydrateFromSupabase('user-profiles-fail', ownerKey), /hydrate 조회 실패/)
    assert.equal(getState().hydration.status, 'failed')
    assert.deepEqual(readJsonKey('cars', ownerKey, []), [{ id: 'seed-car', number: '11가1111' }])
    assert.equal(countOf('profiles', 'upsert'), 0)
    endCloudSession()
  })

  test('vehicles 조회가 실패하면 failed로 남고 cars 로컬 값은 바뀌지 않는다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    handlers.vehicles = { select: () => ({ data: null, error: { message: 'vehicles down' } }) }
    const ownerKey = 'audit4-vehicles-fail'
    writeJsonKey('cars', ownerKey, [{ id: 'seed-car-2', number: '22나2222' }])

    await assert.rejects(() => hydrateFromSupabase('user-vehicles-fail', ownerKey), /hydrate 조회 실패/)
    assert.equal(getState().hydration.status, 'failed')
    assert.deepEqual(readJsonKey('cars', ownerKey, []), [{ id: 'seed-car-2', number: '22나2222' }])
    endCloudSession()
  })

  test('clients 조회가 실패하면 failed로 남고 clients 로컬 값은 바뀌지 않는다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    handlers.clients = { select: () => ({ data: null, error: { message: 'clients down' } }) }
    const ownerKey = 'audit4-clients-fail'
    writeJsonKey('clients', ownerKey, [{ id: 'seed-client', companyName: '테스트거래처' }])

    await assert.rejects(() => hydrateFromSupabase('user-clients-fail', ownerKey), /hydrate 조회 실패/)
    assert.equal(getState().hydration.status, 'failed')
    assert.deepEqual(readJsonKey('clients', ownerKey, []), [{ id: 'seed-client', companyName: '테스트거래처' }])
    endCloudSession()
  })

  test('driver_links 조회가 실패하면 failed로 남고 drivers 로컬 값은 바뀌지 않는다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    handlers.driver_links = { select: () => ({ data: null, error: { message: 'driver_links down' } }) }
    const ownerKey = 'audit4-driverlinks-fail'
    writeJsonKey('drivers', ownerKey, [{ id: 'seed-driver', inviteCode: '123456' }])

    await assert.rejects(() => hydrateFromSupabase('user-driverlinks-fail', ownerKey), /hydrate 조회 실패/)
    assert.equal(getState().hydration.status, 'failed')
    assert.deepEqual(readJsonKey('drivers', ownerKey, []), [{ id: 'seed-driver', inviteCode: '123456' }])
    endCloudSession()
  })

  test('tax_invoices 조회가 실패하면 failed로 남고 invoices 로컬 값은 바뀌지 않는다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    handlers.tax_invoices = { select: () => ({ data: null, error: { message: 'tax_invoices down' } }) }
    const ownerKey = 'audit4-taxinvoices-fail'
    writeJsonKey('invoices', ownerKey, [{ id: 'seed-invoice' }])

    await assert.rejects(() => hydrateFromSupabase('user-taxinvoices-fail', ownerKey), /hydrate 조회 실패/)
    assert.equal(getState().hydration.status, 'failed')
    assert.deepEqual(readJsonKey('invoices', ownerKey, []), [{ id: 'seed-invoice' }])
    endCloudSession()
  })

  test('transport_details 조회가 실패하면 callDetails가 []로 지워지지 않고 failed로 남는다 (핵심 회귀 테스트)', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'audit4-transport-fail'
    handlers.vehicles = { select: () => ({ data: [{ id: 501, type: 'main', number: '33다3333', raw: {} }], error: null }) }
    handlers.daily_logs = { select: () => ({ data: [{ work_date: '2026-08-01', is_off: false, fixed_count: 1, raw: {} }], error: null }) }
    handlers.transport_details = { select: () => ({ data: null, error: { message: 'transport_details down' } }) }

    const seededWorkData = { '2026-08-01': { isOff: false, fixedCount: 1, callDetails: [{ client: '실제콜상세', fare: 100000 }], fuelItems: [], maintItems: [], miscItems: [] } }
    writeJsonKey('workData', ownerKey, seededWorkData)

    await assert.rejects(() => hydrateFromSupabase('user-transport-fail', ownerKey), /hydrate 조회 실패/)
    assert.equal(getState().hydration.status, 'failed')
    assert.deepEqual(readJsonKey('workData', ownerKey, {}), seededWorkData)
    endCloudSession()
  })
})

describe('dirtyJournal 통합 — failed → 로컬 편집 → retry → ready → 정확히 한 번 flush', () => {
  test('재시도 중에도 아직 서버에 못 보낸 로컬 편집은 서버 값으로 덮이지 않는다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'audit4-retry-flow'
    const userId = 'user-retry-flow'

    handlers.vehicles = { select: () => ({ data: null, error: { message: 'first attempt fails' } }) }
    await assert.rejects(() => hydrateFromSupabase(userId, ownerKey))
    assert.equal(getState().hydration.status, 'failed')

    writeJsonKey('profile', ownerKey, { name: '로컬에서 편집한 이름' })
    markDirty(ownerKey, 'profile')
    assert.deepEqual(getDirtyDomains(ownerKey), ['profile'])

    handlers.vehicles = { select: () => ({ data: [], error: null }) }
    handlers.profiles = { select: () => ({ data: { id: userId, name: '서버 이름(오래됨)', settings: {} }, error: null }) }

    await retryHydrate()
    assert.equal(getState().hydration.status, 'ready')
    assert.equal(readJsonKey('profile', ownerKey, {}).name, '로컬에서 편집한 이름')
    endCloudSession()
  })
})

describe('hydrateFromSupabase — single-flight + stale 세대 보호', () => {
  test('StrictMode식 동시 2회 호출에서도 profiles 조회는 한 번만 나가고 조기 ready가 없다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'audit4-strictmode'
    const userId = 'user-strictmode'

    const [snapshotA, snapshotB] = await Promise.all([
      hydrateFromSupabase(userId, ownerKey),
      hydrateFromSupabase(userId, ownerKey),
    ])

    assert.equal(countOf('profiles', 'select'), 1)
    assert.equal(getState().hydration.status, 'ready')
    assert.equal(snapshotA, snapshotB)
    endCloudSession()
  })
})

describe('실패 주입 — hydrate 도중 로그아웃', () => {
  test('로그아웃 도중 이전 hydrate가 나중에 성공해도 idle 상태와 이전 계정 데이터를 store/localStorage에 반영하지 않는다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'audit4-logout-stale'
    const userId = 'user-logout-stale'

    let releaseProfiles
    const gate = new Promise((resolve) => { releaseProfiles = resolve })
    handlers.profiles = { select: () => gate.then(() => ({ data: { id: userId, name: '로그아웃 이후 도착한 서버 이름', settings: {} }, error: null })) }

    const hydratePromise = hydrateFromSupabase(userId, ownerKey)
    await wait(10)
    assert.equal(getState().hydration.status, 'hydrating')

    endCloudSession()
    assert.equal(getState().hydration.status, 'idle')

    releaseProfiles()
    await hydratePromise

    assert.equal(getState().hydration.status, 'idle')
    assert.equal(readJsonKey('profile', ownerKey, {}).name, undefined)
  })
})

describe('사용자 지시 6번 — 로그아웃 후 같은 owner로 즉시 재로그인', () => {
  test('로그아웃 시점에 아직 진행 중이던 이전 hydrate에 재로그인이 합류하지 않고 새로 실행된다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'audit4-relogin-same-owner'
    const userId = 'user-relogin-same-owner'

    let releaseFirst
    const firstGate = new Promise((resolve) => { releaseFirst = resolve })
    handlers.profiles = { select: () => firstGate.then(() => ({ data: { id: userId, name: '로그아웃 이전 이름(오래됨)', settings: {} }, error: null })) }

    const firstHydratePromise = hydrateFromSupabase(userId, ownerKey)
    await wait(10)
    assert.equal(getState().hydration.status, 'hydrating')
    assert.equal(countOf('profiles', 'select'), 1)

    endCloudSession() // 이전 hydrate가 아직 firstGate에 걸려 있는 채로 로그아웃한다.
    assert.equal(getState().hydration.status, 'idle')

    // 곧바로 같은 owner로 재로그인 — 이번엔 서버가 즉시 응답한다.
    handlers.profiles = { select: () => ({ data: { id: userId, name: '재로그인 이후 최신 이름', settings: {} }, error: null }) }
    await hydrateFromSupabase(userId, ownerKey)

    assert.equal(countOf('profiles', 'select'), 2, '재로그인이 이전 in-flight에 합류했다면 새 조회가 나가지 않아 1회에 머물렀을 것이다')
    assert.equal(getState().hydration.status, 'ready', '재로그인이 옛 Promise에 합류해 계속 idle/hydrating으로 멈춰 있으면 안 된다')
    assert.equal(readJsonKey('profile', ownerKey, {}).name, '재로그인 이후 최신 이름')

    releaseFirst() // 로그아웃 이전 요청도 뒤늦게 응답하지만 세대 검사로 무시돼야 한다.
    await firstHydratePromise
    assert.equal(getState().hydration.status, 'ready', '로그아웃 이전 요청의 뒤늦은 완료가 재로그인의 ready 상태를 덮으면 안 된다')
    assert.equal(readJsonKey('profile', ownerKey, {}).name, '재로그인 이후 최신 이름', '옛 요청의 오래된 이름으로 되돌아가면 안 된다')
    endCloudSession()
  })
})

describe('실패 주입 — hydrate 도중 owner(계정) 변경', () => {
  test('hydrate A가 진행 중인데 다른 owner의 hydrate B가 시작되면, A가 늦게 성공해도 B의 ready 상태/데이터를 덮지 않는다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerA = 'audit4-switch-owner-a'
    const ownerB = 'audit4-switch-owner-b'

    let releaseA
    const gateA = new Promise((resolve) => { releaseA = resolve })
    handlers.profiles = { select: () => gateA.then(() => ({ data: { id: 'user-a', name: 'A 계정 이름', settings: {} }, error: null })) }

    const hydrateAPromise = hydrateFromSupabase('user-a', ownerA)
    await wait(10)
    assert.equal(getState().hydration.status, 'hydrating')

    // A가 아직 게이트에 걸려 있는 동안 B(다른 owner)가 hydrate를 시작해 성공한다.
    handlers.profiles = { select: () => ({ data: { id: 'user-b', name: 'B 계정 이름', settings: {} }, error: null }) }
    await hydrateFromSupabase('user-b', ownerB)
    assert.equal(getState().hydration.status, 'ready')
    assert.equal(getState().hydration.ownerKey, ownerB)

    releaseA()
    await hydrateAPromise // A는 이제야 응답을 받지만 이미 세대가 지났다.

    assert.equal(getState().hydration.status, 'ready', 'A의 뒤늦은 완료가 B의 ready 상태를 건드리면 안 된다')
    assert.equal(getState().hydration.ownerKey, ownerB, 'A의 뒤늦은 완료가 hydration.ownerKey를 A로 되돌리면 안 된다')
    assert.equal(readJsonKey('profile', ownerA, {}).name, undefined, 'A 계정 데이터가 A의 localStorage에도 안 쓰였어야 한다(전부 버려짐)')
    endCloudSession()
  })
})

describe('hydrate — outbox tombstone/pending 재적용 (사용자 지시 4번)', () => {
  test('활성 tombstone이 있는 차량은 서버 응답에 있어도 hydrate 결과에서 제외된다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'audit4-hydrate-tombstone-car'
    const userId = 'user-hydrate-tombstone-car'
    handlers.vehicles = { select: () => ({ data: [{ id: 900, type: 'main', number: '77가7777', raw: {} }], error: null }) }

    seedOutboxOp(ownerKey, buildTombstoneOp({ ownerKey, userId, resourceType: 'vehicle', resourceId: 900, operation: 'delete', sessionEpoch: 0 }))

    await hydrateFromSupabase(userId, ownerKey)
    assert.equal(getState().hydration.status, 'ready')
    const cars = readJsonKey('cars', ownerKey, [])
    assert.equal(cars.some((car) => car.supabaseId === 900), false, '삭제 대기 중인 차량이 hydrate로 부활하면 안 된다')
    endCloudSession()
  })

  test('대기 중인 기사 상태변경은 서버 값이 아니라 로컬 pending 값으로 유지된다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'audit4-hydrate-pending-driver'
    const userId = 'user-hydrate-pending-driver'
    writeJsonKey('drivers', ownerKey, [{ id: 'local-driver-1', supabaseId: 700, inviteCode: '123456', status: 'pending', name: '기사' }])
    handlers.driver_links = { select: () => ({ data: [{ id: 700, invite_code: '123456', status: 'pending', vehicle_id: null, assignment_start: '2026-08-01', assignment_end: null }], error: null }) }

    seedOutboxOp(ownerKey, buildMutationOp({
      ownerKey, userId, resourceType: 'driverLink', resourceId: 'local-driver-1', operation: 'updateStatus',
      payload: { supabaseId: 700, status: 'linked' }, sessionEpoch: 0,
    }))

    await hydrateFromSupabase(userId, ownerKey)
    assert.equal(getState().hydration.status, 'ready')
    const drivers = readJsonKey('drivers', ownerKey, [])
    const driver = drivers.find((item) => item.id === 'local-driver-1')
    assert.equal(driver?.status, 'linked', '서버가 아직 pending을 반환해도 로컬의 pending mutation(linked 의도)이 유지돼야 한다')
    endCloudSession()
  })
})
