import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'

// 실제 네트워크 없이 도는 가짜 supabase 클라이언트. cloudSync.js가 처음 import되기 전에
// mock.module로 바꿔치기해야 하므로 이 파일 맨 위, 다른 임포트보다 먼저 등록한다.
// handlers는 테스트마다 resetHandlers()/Object.assign으로 다시 채워 넣는 공유 가변 상태다
// (mock.module은 파일 전체에서 한 번만 걸 수 있어서, 테이블별 동작은 handlers로 바꾼다).
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

function resetHandlers() {
  Object.keys(handlers).forEach((key) => delete handlers[key])
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
      select: () => chainable(h.select || (() => ({ data: [], error: null }))),
      upsert: (row) => chainable(() => (h.upsert ? h.upsert(row) : { data: null, error: null })),
      insert: (row) => chainable(() => (h.insert ? h.insert(row) : { data: null, error: null })),
      update: (row) => chainable(() => (h.update ? h.update(row) : { data: null, error: null })),
      delete: () => chainable(h.delete || (() => ({ data: null, error: null }))),
    }
  },
  auth: { signOut: async () => ({ error: null }) },
}

mock.module('../supabaseClient.js', { exports: { supabase: fakeSupabase } })

const { endCloudSession, flushCloudSync, hydrateFromSupabase, scheduleCloudSync } = await import('./cloudSync.js')
const { getState } = await import('../store/app-store.js')

describe('hydrateFromSupabase — 실패 상태', () => {
  test('profiles 조회가 실패하면 status가 failed로 남고 예외가 올라온다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    handlers.profiles = { select: () => { throw new Error('network down') } }

    await assert.rejects(() => hydrateFromSupabase('user-fail', 'cloud-fail-owner'), /network down/)
    assert.equal(getState().hydration.status, 'failed')
  })

  test('failed 상태에서는 scheduleCloudSync/flushCloudSync가 원격 upsert를 시도하지 않는다', async () => {
    // 위 테스트가 남긴 failed 상태 + cloudUserId/cloudOwnerKey를 그대로 이어받는다.
    let upsertCalled = false
    handlers.profiles = {
      select: () => ({ data: null, error: null }),
      upsert: () => { upsertCalled = true; return { data: null, error: null } },
    }
    scheduleCloudSync()
    await flushCloudSync()
    assert.equal(upsertCalled, false, 'failed 상태에서는 원격 upsert가 일어나면 안 된다')
    endCloudSession()
  })
})

describe('hydrateFromSupabase — 성공 시 ready + 막혀 있던 변경 자동 플러시', () => {
  test('idle일 때 생긴 변경(dirty queue)은 hydrate가 ready가 되는 순간 자동으로 한 번 플러시된다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    let upsertCount = 0
    handlers.profiles.upsert = () => { upsertCount += 1; return { data: null, error: null } }

    scheduleCloudSync() // 아직 idle — pendingWhileBlocked만 표시되고 네트워크 호출 없음
    assert.equal(upsertCount, 0)

    await hydrateFromSupabase('user-ready', 'cloud-ready-owner')
    assert.equal(getState().hydration.status, 'ready')

    await new Promise((resolve) => setTimeout(resolve, 700)) // 600ms 디바운스가 실행될 때까지
    assert.ok(upsertCount >= 1, 'ready가 되면 막혀 있던 변경이 자동으로 플러시돼야 한다')
    endCloudSession()
  })
})

describe('flushCloudSync — in-flight 재실행(dirty)', () => {
  test('실행 중에 추가 변경이 들어오면, 그 실행이 끝난 뒤 한 번 더 돌고서야 resolve한다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    let upsertCount = 0
    let releaseFirst
    const firstGate = new Promise((resolve) => { releaseFirst = resolve })
    handlers.profiles.upsert = () => {
      upsertCount += 1
      if (upsertCount === 1) return firstGate.then(() => ({ data: null, error: null }))
      return { data: null, error: null }
    }

    await hydrateFromSupabase('user-inflight', 'cloud-inflight-owner')
    assert.equal(upsertCount, 0, 'hydrate 자체는 upsert를 부르지 않는다')

    const p1 = flushCloudSync() // 첫 실행 — profiles.upsert가 firstGate에 걸려 대기
    await new Promise((resolve) => setTimeout(resolve, 10)) // upsert 호출까지는 가게 양보
    assert.equal(upsertCount, 1)

    const p2 = flushCloudSync() // 아직 첫 실행 중 — dirty만 표시하고 같은 실행을 기다려야 한다
    releaseFirst()
    await Promise.all([p1, p2])

    assert.equal(upsertCount, 2, 'in-flight 중 들어온 변경 때문에 한 번 더 돌아야 한다')
    endCloudSession()
  })

  test('pagehide처럼 flushCloudSync만 불러도 600ms 디바운스로 재예약하며 빠져나가지 않는다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    let upsertCount = 0
    handlers.profiles.upsert = () => { upsertCount += 1; return { data: null, error: null } }

    await hydrateFromSupabase('user-pagehide', 'cloud-pagehide-owner')

    const start = Date.now()
    await flushCloudSync()
    const elapsed = Date.now() - start

    assert.ok(upsertCount >= 1)
    assert.ok(elapsed < 500, `flushCloudSync는 디바운스를 기다리지 않고 즉시 돌아야 한다(경과 ${elapsed}ms)`)
    endCloudSession()
  })
})
