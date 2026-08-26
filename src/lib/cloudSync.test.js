import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'

// 실제 네트워크 없이 도는 가짜 supabase 클라이언트. cloudSync.js가 처음 import되기 전에
// mock.module로 바꿔치기해야 하므로 이 파일 맨 위, 다른 임포트보다 먼저 등록한다.
// handlers는 테스트마다 resetHandlers()/Object.assign으로 다시 채워 넣는 공유 가변 상태다
// (mock.module은 파일 전체에서 한 번만 걸 수 있어서, 테이블별 동작은 handlers로 바꾼다).
// callCounts는 각 테스트가 "원격 쓰기가 정확히 몇 번 나갔는지"를 직접 세어 확인할 수 있게
// 한다(감사 지적 9번 — 최종 state만 보고 "아마 안 갔겠지"라고 넘어가지 않는다).
function chainable(getResult) {
  return {
    select: () => chainable(getResult),
    eq: () => chainable(getResult),
    neq: () => chainable(getResult),
    order: () => chainable(getResult),
    maybeSingle: () => chainable(getResult),
    single: () => chainable(getResult),
    then: (onFulfilled, onRejected) => Promise.resolve().then(getResult).then(onFulfilled, onRejected),
    catch: (onRejected) => Promise.resolve().then(getResult).catch(onRejected),
  }
}

const handlers = {}
const callCounts = {}

function resetHandlers() {
  Object.keys(handlers).forEach((key) => delete handlers[key])
  Object.keys(callCounts).forEach((key) => delete callCounts[key])
}

function bump(table, method) {
  const key = `${table}.${method}`
  callCounts[key] = (callCounts[key] || 0) + 1
}

function countOf(table, method) {
  return callCounts[`${table}.${method}`] || 0
}

function emptyOkHandlers() {
  return {
    profiles: { select: () => ({ data: null, error: null }) },
    vehicles: { select: () => ({ data: [], error: null }) },
    clients: { select: () => ({ data: [], error: null }) },
    driver_links: { select: () => ({ data: [], error: null }) },
    tax_invoices: { select: () => ({ data: [], error: null }) },
  }
}

const fakeSupabase = {
  from(table) {
    const h = handlers[table] || {}
    return {
      select: () => { bump(table, 'select'); return chainable(h.select || (() => ({ data: [], error: null }))) },
      upsert: (row) => { bump(table, 'upsert'); return chainable(() => (h.upsert ? h.upsert(row) : { data: null, error: null })) },
      insert: (row) => { bump(table, 'insert'); return chainable(() => (h.insert ? h.insert(row) : { data: null, error: null })) },
      update: (row) => { bump(table, 'update'); return chainable(() => (h.update ? h.update(row) : { data: null, error: null })) },
      delete: () => { bump(table, 'delete'); return chainable(h.delete || (() => ({ data: null, error: null }))) },
    }
  },
  auth: { signOut: async () => ({ error: null }) },
}

mock.module('../supabaseClient.js', { exports: { supabase: fakeSupabase } })

const {
  endCloudSession,
  flushCloudSync,
  hydrateFromSupabase,
  retryHydrate,
  scheduleCloudSync,
} = await import('./cloudSync.js')
const { getState } = await import('../store/app-store.js')
const { markDirty, hasDirty, getDirtyDomains } = await import('./dirtyJournal.js')
const { readJsonKey, writeJsonKey } = await import('../store/persist.js')

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('hydrateFromSupabase — 조회 실패는 전부 failed로, 부분 반영 없음', () => {
  test('profiles 조회가 실패하면 status가 failed로 남고, 로컬/store는 그대로다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    handlers.profiles = { select: () => ({ data: null, error: { message: 'profiles down' } }) }
    const ownerKey = 'audit2-profiles-fail'
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
    const ownerKey = 'audit2-vehicles-fail'
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
    const ownerKey = 'audit2-clients-fail'
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
    const ownerKey = 'audit2-driverlinks-fail'
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
    const ownerKey = 'audit2-taxinvoices-fail'
    writeJsonKey('invoices', ownerKey, [{ id: 'seed-invoice' }])

    await assert.rejects(() => hydrateFromSupabase('user-taxinvoices-fail', ownerKey), /hydrate 조회 실패/)
    assert.equal(getState().hydration.status, 'failed')
    assert.deepEqual(readJsonKey('invoices', ownerKey, []), [{ id: 'seed-invoice' }])
    endCloudSession()
  })

  test('transport_details 조회가 실패하면 callDetails가 []로 지워지지 않고 failed로 남는다 (핵심 회귀 테스트)', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'audit2-transport-fail'
    // mainCar가 해석되도록 vehicles가 성공해야 daily_logs/transport_details 조회 구간까지 간다.
    handlers.vehicles = { select: () => ({ data: [{ id: 501, type: 'main', number: '33다3333', raw: {} }], error: null }) }
    handlers.daily_logs = { select: () => ({ data: [{ work_date: '2026-08-01', is_off: false, fixed_count: 1, raw: {} }], error: null }) }
    handlers.transport_details = { select: () => ({ data: null, error: { message: 'transport_details down' } }) }

    const seededWorkData = { '2026-08-01': { isOff: false, fixedCount: 1, callDetails: [{ client: '실제콜상세', fare: 100000 }], fuelItems: [], maintItems: [], miscItems: [] } }
    writeJsonKey('workData', ownerKey, seededWorkData)

    await assert.rejects(() => hydrateFromSupabase('user-transport-fail', ownerKey), /hydrate 조회 실패/)
    assert.equal(getState().hydration.status, 'failed')
    assert.deepEqual(readJsonKey('workData', ownerKey, {}), seededWorkData, 'transport_details 실패 시 기존 콜상세가 지워지면 안 된다')
    endCloudSession()
  })

  test('failed 상태에서는 scheduleCloudSync/flushCloudSync가 원격 upsert를 시도하지 않는다', async () => {
    // 이 테스트는 스스로 failed 상태를 만든다 — 앞선 테스트의 실패 상태를 빌려 쓰지 않는다
    // (감사 지적 9번: 테스트 간 독립성).
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    handlers.profiles.select = () => ({ data: null, error: { message: 'boom' } })
    const ownerKey = 'audit2-blocked-write'
    await assert.rejects(() => hydrateFromSupabase('user-blocked-write', ownerKey), /hydrate 조회 실패/)
    assert.equal(getState().hydration.status, 'failed')

    handlers.profiles = {
      select: () => ({ data: null, error: null }),
      upsert: () => ({ data: null, error: null }),
    }
    markDirty(ownerKey, 'profile')
    scheduleCloudSync()
    await flushCloudSync()
    assert.equal(countOf('profiles', 'upsert'), 0, 'failed 상태에서는 원격 upsert가 일어나면 안 된다')
    endCloudSession()
  })
})

describe('dirtyJournal 통합 — failed → 로컬 편집 → retry → ready → 정확히 한 번 flush', () => {
  test('재시도 중에도 아직 서버에 못 보낸 로컬 편집은 서버 값으로 덮이지 않고, ready 이후 자동으로 정확히 한 번만 플러시된다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'audit2-retry-flow'
    const userId = 'user-retry-flow'

    // 1) 첫 시도는 실패시킨다.
    handlers.vehicles = { select: () => ({ data: null, error: { message: 'first attempt fails' } }) }
    await assert.rejects(() => hydrateFromSupabase(userId, ownerKey), /hydrate 조회 실패/)
    assert.equal(getState().hydration.status, 'failed')

    // 2) 실패 상태에서 로컬 편집이 들어온다 — durable dirty journal에 남는다.
    writeJsonKey('profile', ownerKey, { name: '로컬에서 편집한 이름' })
    markDirty(ownerKey, 'profile')
    assert.ok(hasDirty(ownerKey))
    assert.deepEqual(getDirtyDomains(ownerKey), ['profile'])

    // 3) 서버는 이제 정상 응답하지만, profiles 응답의 이름은 로컬 편집과 다르다 —
    //    dirty로 남은 profile 도메인은 이 서버 값으로 덮이면 안 된다.
    handlers.vehicles = { select: () => ({ data: [], error: null }) }
    handlers.profiles = {
      select: () => ({ data: { id: userId, name: '서버 이름(오래됨)', settings: {} }, error: null }),
      upsert: () => ({ data: null, error: null }),
    }

    await retryHydrate()
    assert.equal(getState().hydration.status, 'ready')
    assert.equal(readJsonKey('profile', ownerKey, {}).name, '로컬에서 편집한 이름', 'dirty 도메인은 hydrate 결과로 덮이면 안 된다')
    assert.ok(hasDirty(ownerKey), 'hydrate 자체는 저널을 지우지 않는다 — 아직 서버로 안 보냈다')

    // 4) ready가 되는 순간 hasDirty()를 보고 자동으로 한 번 플러시했어야 한다(600ms 디바운스 이후).
    await wait(700)
    assert.equal(countOf('profiles', 'upsert'), 1, '정확히 한 번만 플러시돼야 한다')
    assert.equal(hasDirty(ownerKey), false, '성공적으로 플러시됐으면 저널이 비어야 한다')
    endCloudSession()
  })
})

describe('hydrateFromSupabase — single-flight + stale 세대 보호', () => {
  test('StrictMode식 동시 2회 호출에서도 profiles 조회는 한 번만 나가고 조기 ready가 없다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'audit2-strictmode'
    const userId = 'user-strictmode'

    const [snapshotA, snapshotB] = await Promise.all([
      hydrateFromSupabase(userId, ownerKey),
      hydrateFromSupabase(userId, ownerKey),
    ])

    assert.equal(countOf('profiles', 'select'), 1, '같은 owner를 동시에 불러도 조회는 한 번만 나가야 한다')
    assert.equal(getState().hydration.status, 'ready')
    assert.equal(snapshotA, snapshotB, '두 호출이 같은 in-flight Promise를 공유해야 한다')
    endCloudSession()
  })
})

describe('hydrateFromSupabase — 성공 시 ready + dirty 상태 자동 플러시(scheduleCloudSync 호출 횟수 spy)', () => {
  test('idle일 때 생긴 로컬 변경(dirty)은 hydrate가 ready가 되는 순간 자동으로 한 번 플러시된다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'audit2-idle-dirty'
    handlers.profiles.upsert = () => ({ data: null, error: null })

    // idle 상태에서의 로컬 변경은 (2차 감사 보완으로) scheduleCloudSync가 아니라
    // 호출부(app-store.js commitBatch)가 markDirty로 남긴다 — 여기서는 그 계약을 직접
    // 흉내낸다.
    markDirty(ownerKey, 'cars')
    scheduleCloudSync() // idle이므로 아무 네트워크도 안 나가야 한다.
    assert.equal(countOf('profiles', 'upsert'), 0)

    await hydrateFromSupabase('user-idle-dirty', ownerKey)
    assert.equal(getState().hydration.status, 'ready')

    await wait(700) // 600ms 디바운스가 실행될 때까지
    assert.ok(countOf('profiles', 'upsert') >= 1, 'ready가 되면 막혀 있던 변경이 자동으로 플러시돼야 한다')
    endCloudSession()
  })
})

describe('flushCloudSync — in-flight 재실행(dirty)', () => {
  test('실행 중에 추가 변경이 들어오면, 그 실행이 끝난 뒤 한 번 더 돌고서야 resolve한다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'audit2-inflight'
    let releaseFirst
    const firstGate = new Promise((resolve) => { releaseFirst = resolve })
    handlers.profiles.upsert = () => {
      if (countOf('profiles', 'upsert') === 1) return firstGate.then(() => ({ data: null, error: null }))
      return { data: null, error: null }
    }

    await hydrateFromSupabase('user-inflight', ownerKey)
    assert.equal(countOf('profiles', 'upsert'), 0, 'hydrate 자체는 upsert를 부르지 않는다')

    markDirty(ownerKey, 'cars')
    const p1 = flushCloudSync() // 첫 실행 — profiles.upsert가 firstGate에 걸려 대기
    await wait(10) // upsert 호출까지는 가게 양보
    assert.equal(countOf('profiles', 'upsert'), 1)

    markDirty(ownerKey, 'clients')
    const p2 = flushCloudSync() // 아직 첫 실행 중 — dirty만 표시하고 같은 실행을 기다려야 한다
    releaseFirst()
    await Promise.all([p1, p2])

    assert.equal(countOf('profiles', 'upsert'), 2, 'in-flight 중 들어온 변경 때문에 한 번 더 돌아야 한다')
    assert.equal(hasDirty(ownerKey), false)
    endCloudSession()
  })

  test('pagehide처럼 flushCloudSync만 불러도 600ms 디바운스로 재예약하며 빠져나가지 않는다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'audit2-pagehide'
    handlers.profiles.upsert = () => ({ data: null, error: null })

    await hydrateFromSupabase('user-pagehide', ownerKey)
    markDirty(ownerKey, 'cars')

    const start = Date.now()
    await flushCloudSync()
    const elapsed = Date.now() - start

    assert.ok(countOf('profiles', 'upsert') >= 1)
    assert.ok(elapsed < 500, `flushCloudSync는 디바운스를 기다리지 않고 즉시 돌아야 한다(경과 ${elapsed}ms)`)
    endCloudSession()
  })
})
