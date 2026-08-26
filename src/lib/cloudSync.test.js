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
  blockedReasonForCloudWrite,
  deleteClientFromSupabase,
  deleteDriverLinkOnSupabase,
  deleteVehicleFromSupabase,
  endCloudSession,
  flushCloudSync,
  hydrateFromSupabase,
  retryHydrate,
  scheduleCloudSync,
  updateDriverLinkStatusOnSupabase,
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

describe('endCloudSession — 로그아웃이 지연 응답 중인 hydrate를 무효화한다 (커밋 전 자체 교차검증에서 발견)', () => {
  test('로그아웃 도중 이전 hydrate가 나중에 성공해도 idle 상태와 로그아웃 이전 store 값을 덮어쓰지 않는다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'audit2-logout-stale'
    const userId = 'user-logout-stale'

    let releaseProfiles
    const gate = new Promise((resolve) => { releaseProfiles = resolve })
    handlers.profiles.select = () => gate.then(() => ({ data: { id: userId, name: '로그아웃 이후 도착한 서버 이름', settings: {} }, error: null }))

    const hydratePromise = hydrateFromSupabase(userId, ownerKey)
    await wait(10) // profiles 게이트에 걸릴 때까지 양보
    assert.equal(getState().hydration.status, 'hydrating')

    endCloudSession() // 로그아웃 — hydrateGeneration을 올려서 이 hydrate를 stale로 만들어야 한다
    assert.equal(getState().hydration.status, 'idle')

    releaseProfiles() // 지연됐던 응답이 이제 도착 — 나머지 조회는 전부 성공(emptyOkHandlers)
    await hydratePromise

    assert.equal(getState().hydration.status, 'idle', '로그아웃 이후 늦게 끝난 hydrate가 idle을 ready로 덮으면 안 된다')
    assert.equal(readJsonKey('profile', ownerKey, {}).name, undefined, '로그아웃 이후 도착한 서버 값이 localStorage에 반영되면 안 된다')
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

describe('blockedReasonForCloudWrite — UI가 로컬 변경을 시작하기 전에 판정한다', () => {
  test('cloudId(supabaseId)가 없으면(로컬 전용 레코드) 항상 허용한다 — hydrate 상태와 무관', () => {
    assert.equal(blockedReasonForCloudWrite(null), null)
    assert.equal(blockedReasonForCloudWrite(undefined), null)
    assert.equal(blockedReasonForCloudWrite(''), null)
  })

  test('cloudId가 있고 hydrate가 ready면 허용(null)한다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    await hydrateFromSupabase('user-blocked-ready', 'audit3-blocked-ready')
    assert.equal(blockedReasonForCloudWrite('vehicle-123'), null)
    endCloudSession()
  })

  test('cloudId가 있는데 hydrate가 실패/로그아웃 상태면 메시지를 돌려준다(진행 금지)', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    handlers.profiles.select = () => ({ data: null, error: { message: 'boom' } })
    await assert.rejects(() => hydrateFromSupabase('user-blocked-failed', 'audit3-blocked-failed'))
    assert.equal(getState().hydration.status, 'failed')
    assert.ok(blockedReasonForCloudWrite('vehicle-123'), 'failed 상태면 진행을 막아야 한다')

    endCloudSession()
    assert.ok(blockedReasonForCloudWrite('vehicle-123'), '로그아웃(세션 없음) 상태에서도 cloudId가 있으면 막아야 한다')
  })
})

describe('failed 상태에서는 UI가 직접 부르는 mutation이 서버를 전혀 호출하지 않는다 (감사 지적 2번 최소 회귀)', () => {
  async function makeFailedSession(userId, ownerKey) {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    handlers.profiles.select = () => ({ data: null, error: { message: 'boom' } })
    await assert.rejects(() => hydrateFromSupabase(userId, ownerKey))
    assert.equal(getState().hydration.status, 'failed')
  }

  test('failed 상태에서 차량 삭제 시도 시 로컬 차량은 유지되고(코드상 보장) 서버 호출은 0회다', async () => {
    await makeFailedSession('user-fail-delvehicle', 'audit3-fail-delvehicle')
    // UI 컴포넌트는 confirmRemove()에서 blockedReasonForCloudWrite로 이 지점에 오기
    // *전에* 로컬 삭제를 건너뛴다 — 여기서는 그 가정이 실제로 성립하는지, 즉
    // deleteVehicleFromSupabase 자체가 어떤 테이블도 건드리지 않고 즉시 거부하는지를
    // 직접 검증한다(로컬 상태는 React 컴포넌트 밖이라 이 파일에서 렌더 테스트는 못
    // 하지만, confirmRemove()가 이 함수보다 먼저 실행되지 않는 이상 로컬 삭제로
    // 이어지지 않는다는 것은 코드 리뷰로 확인됨 — CarManagementPage.jsx 참고).
    await assert.rejects(() => deleteVehicleFromSupabase('vehicle-999'), /준비되지 않았습니다/)
    assert.equal(countOf('vehicles', 'delete'), 0)
    assert.equal(countOf('transport_details', 'delete'), 0)
    assert.equal(countOf('daily_logs', 'delete'), 0)
    endCloudSession()
  })

  test('failed 상태에서 거래처 삭제 시도 시 서버 호출은 0회다', async () => {
    await makeFailedSession('user-fail-delclient', 'audit3-fail-delclient')
    await assert.rejects(() => deleteClientFromSupabase('client-999'), /준비되지 않았습니다/)
    assert.equal(countOf('clients', 'delete'), 0)
    assert.equal(countOf('transport_details', 'update'), 0)
    endCloudSession()
  })

  test('failed 상태에서 기사 상태변경 시도 시 서버 호출은 0회다', async () => {
    await makeFailedSession('user-fail-driverstatus', 'audit3-fail-driverstatus')
    await assert.rejects(() => updateDriverLinkStatusOnSupabase('link-999', 'linked'), /준비되지 않았습니다/)
    assert.equal(countOf('driver_links', 'update'), 0)
    endCloudSession()
  })

  test('failed 상태에서 기사 삭제 시도 시 서버 호출은 0회다', async () => {
    await makeFailedSession('user-fail-driverdelete', 'audit3-fail-driverdelete')
    await assert.rejects(() => deleteDriverLinkOnSupabase('link-999'), /준비되지 않았습니다/)
    assert.equal(countOf('driver_links', 'delete'), 0)
    endCloudSession()
  })
})

describe('retry 성공 후 다시 시도하면 로컬·서버 모두 반영된다 (감사 지적 2번 4번째 요구)', () => {
  test('실패 상태에서는 막히고, retryHydrate 성공 이후 같은 작업을 다시 하면 서버 호출이 나간다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'audit3-retry-then-delete'
    const userId = 'user-retry-then-delete'

    // 1) 첫 시도는 실패시킨다.
    handlers.vehicles = { select: () => ({ data: null, error: { message: 'first attempt fails' } }) }
    await assert.rejects(() => hydrateFromSupabase(userId, ownerKey))
    assert.equal(getState().hydration.status, 'failed')

    // 2) failed 상태에서는 UI 가드가 막고, 실제로 서버 삭제 함수도 호출되면 안 된다.
    assert.ok(blockedReasonForCloudWrite('vehicle-1'), 'failed면 UI가 로컬 삭제 전에 막아야 한다')
    await assert.rejects(() => deleteVehicleFromSupabase('vehicle-1'))
    assert.equal(countOf('vehicles', 'delete'), 0)

    // 3) 재시도가 성공한다.
    handlers.vehicles = { select: () => ({ data: [], error: null }) }
    await retryHydrate()
    assert.equal(getState().hydration.status, 'ready')

    // 4) 이제 같은 작업을 사용자가 다시 수행하면 — UI 가드는 통과시키고, 서버 호출도 나간다.
    assert.equal(blockedReasonForCloudWrite('vehicle-1'), null, 'ready가 되면 UI 가드가 더 이상 막으면 안 된다')
    await deleteVehicleFromSupabase('vehicle-1')
    assert.equal(countOf('vehicles', 'delete'), 1, '재시도 성공 후에는 서버 호출이 정상적으로 나가야 한다')
    endCloudSession()
  })
})
