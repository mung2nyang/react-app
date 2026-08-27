import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { createFakeSupabase, wait } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf, emptyOkHandlers } = createFakeSupabase()
mock.module('../supabaseClient.js', { exports: { supabase: fakeSupabase } })

const { hydrateFromSupabase } = await import('./hydrate.js')
const { endCloudSession } = await import('./cloudSession.js')
const { flushCloudSync, scheduleCloudSync } = await import('./syncQueue.js')
const { getState } = await import('../store/app-store.js')
const { markDirty, hasDirty } = await import('./dirtyJournal.js')
const { writeJsonKey } = await import('../store/persist.js')

describe('failed 상태에서는 scheduleCloudSync/flushCloudSync가 원격 upsert를 시도하지 않는다', () => {
  test('hydrate가 실패하면 이후 scheduleCloudSync/flushCloudSync 둘 다 아무 것도 안 한다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    handlers.profiles.select = () => ({ data: null, error: { message: 'boom' } })
    const ownerKey = 'syncqueue-blocked-write'
    await assert.rejects(() => hydrateFromSupabase('user-blocked-write', ownerKey), /hydrate 조회 실패/)
    assert.equal(getState().hydration.status, 'failed')

    handlers.profiles = { select: () => ({ data: null, error: null }), upsert: () => ({ data: null, error: null }) }
    markDirty(ownerKey, 'profile')
    scheduleCloudSync()
    await flushCloudSync()
    assert.equal(countOf('profiles', 'upsert'), 0, 'failed 상태에서는 원격 upsert가 일어나면 안 된다')
    endCloudSession()
  })
})

describe('hydrate 성공 시 ready + dirty 상태 자동 플러시', () => {
  test('idle일 때 생긴 로컬 변경(dirty)은 hydrate가 ready가 되는 순간 자동으로 한 번 플러시된다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'syncqueue-idle-dirty'
    handlers.profiles.upsert = () => ({ data: null, error: null })

    markDirty(ownerKey, 'cars')
    scheduleCloudSync() // idle이므로 아무 네트워크도 안 나가야 한다.
    assert.equal(countOf('profiles', 'upsert'), 0)

    await hydrateFromSupabase('user-idle-dirty', ownerKey)
    assert.equal(getState().hydration.status, 'ready')

    await wait(700)
    assert.ok(countOf('profiles', 'upsert') >= 1, 'ready가 되면 막혀 있던 변경이 자동으로 플러시돼야 한다')
    endCloudSession()
  })
})

describe('flushCloudSync — in-flight 재실행(dirty)', () => {
  test('실행 중에 추가 변경이 들어오면, 그 실행이 끝난 뒤 한 번 더 돌고서야 resolve한다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'syncqueue-inflight'
    let releaseFirst
    const firstGate = new Promise((resolve) => { releaseFirst = resolve })
    handlers.profiles.upsert = () => {
      if (countOf('profiles', 'upsert') === 1) return firstGate.then(() => ({ data: null, error: null }))
      return { data: null, error: null }
    }

    await hydrateFromSupabase('user-inflight', ownerKey)
    assert.equal(countOf('profiles', 'upsert'), 0, 'hydrate 자체는 upsert를 부르지 않는다')

    markDirty(ownerKey, 'cars')
    const p1 = flushCloudSync()
    await wait(10)
    assert.equal(countOf('profiles', 'upsert'), 1)

    markDirty(ownerKey, 'clients')
    const p2 = flushCloudSync()
    releaseFirst()
    await Promise.all([p1, p2])

    assert.equal(countOf('profiles', 'upsert'), 2, 'in-flight 중 들어온 변경 때문에 한 번 더 돌아야 한다')
    assert.equal(hasDirty(ownerKey), false)
    endCloudSession()
  })

  test('pagehide처럼 flushCloudSync만 불러도 600ms 디바운스로 재예약하며 빠져나가지 않는다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'syncqueue-pagehide'
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

// 사용자 지시 7번: 일반 syncQueue도 outbox처럼 실행 중 로그아웃/owner 전환을 세대
// (epoch)로 방어해야 한다 — 특히 이미 시작된 syncAll이 로그아웃/전환 *이후*에 성공
// 응답을 받아도, clearDirty를 불러 "이 owner는 이제 서버와 다 맞다"고 잘못 표시하면
// 안 된다(다음 재로그인이 그 dirty 사실을 다시 못 보게 된다).
describe('실패 주입 — syncQueue 실행 중 로그아웃/owner 전환 (사용자 지시 7번)', () => {
  test('syncAll이 도는 도중 로그아웃하면, 응답이 늦게 와도 clearDirty를 부르지 않아 dirty 표시가 남는다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'syncqueue-epoch-logout'
    let releaseUpsert
    const gate = new Promise((resolve) => { releaseUpsert = resolve })
    handlers.profiles.upsert = () => gate.then(() => ({ data: null, error: null }))

    await hydrateFromSupabase('user-epoch-logout', ownerKey)
    markDirty(ownerKey, 'cars')

    const flushPromise = flushCloudSync()
    await wait(10)
    assert.equal(countOf('profiles', 'upsert'), 1, 'syncAll이 이미 원격 upsert를 시작했어야 한다')
    assert.equal(hasDirty(ownerKey), true, '아직 성공 응답을 못 받았으니 dirty가 남아 있어야 한다')

    endCloudSession() // 응답이 오기 전에 로그아웃 — 세대가 올라간다.
    releaseUpsert() // 로그아웃 이후에야 늦게 성공 응답이 도착한다.
    await flushPromise

    assert.equal(hasDirty(ownerKey), true, '로그아웃 이후에 도착한 성공 응답으로 clearDirty가 불리면 안 된다(다음 재로그인이 다시 판단해야 한다)')
  })

  // 4차 재작업(사용자 지시 3번): syncAll() 내부도 profile upsert 직후부터 각 도메인
  // sync 직후까지 매 단계 세션을 재검증해야 한다 — profile 응답을 기다리는 동안
  // 로그아웃하면 vehicles 이하는 아예 호출되면 안 된다(이전에는 profile 성공 후
  // 무조건 vehicles/clients로 넘어갔다).
  test('profile 응답을 기다리는 도중 로그아웃하면 vehicles/clients 이하 호출이 0회이고 dirty가 유지된다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'syncqueue-epoch-profile-wait'
    writeJsonKey('cars', ownerKey, [{ id: 'car-1', number: '12가1234', type: 'sub' }]) // supabaseId 없음 — syncVehicles가 실제로 원격 호출을 낸다.
    writeJsonKey('clients', ownerKey, [{ id: 'client-1', companyName: '테스트거래처' }])

    let releaseUpsert
    const gate = new Promise((resolve) => { releaseUpsert = resolve })
    handlers.profiles.upsert = () => gate.then(() => ({ data: null, error: null }))

    await hydrateFromSupabase('user-epoch-profile-wait', ownerKey) // hydrate 자체도 vehicles.select를 한 번 부른다 — 그 이후를 기준선으로 삼는다.
    const baselineVehiclesSelect = countOf('vehicles', 'select')
    markDirty(ownerKey, 'cars')

    const flushPromise = flushCloudSync()
    try {
      await wait(10)
      assert.equal(countOf('profiles', 'upsert'), 1, 'profile upsert는 이미 나갔어야 한다')
      assert.equal(countOf('vehicles', 'select'), baselineVehiclesSelect, 'vehicles 이하는 아직 시작하면 안 된다')
    } finally {
      endCloudSession() // profile 응답이 오기 전에 로그아웃한다.
      releaseUpsert()
      await flushPromise // 실패 여부와 무관하게 항상 게이트를 풀고 끝까지 기다려야, 다음 테스트가 이 flush의 잔여 상태를 물려받지 않는다.
    }

    assert.equal(countOf('vehicles', 'select'), baselineVehiclesSelect, '로그아웃 이후에는 vehicles 조회가 아예 나가면 안 된다')
    assert.equal(countOf('vehicles', 'insert'), 0)
    assert.equal(countOf('clients', 'insert'), 0, 'clients 이하도 마찬가지로 0회여야 한다')
    assert.equal(hasDirty(ownerKey), true, '중단됐으니 dirty가 그대로 남아야 한다')
  })

  test('syncAll이 도는 도중 다른 owner로 전환되면, 원래 owner의 dirty 표시는 지워지지 않는다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerA = 'syncqueue-epoch-switch-a'
    const ownerB = 'syncqueue-epoch-switch-b'
    let releaseUpsert
    const gate = new Promise((resolve) => { releaseUpsert = resolve })
    handlers.profiles.upsert = () => gate.then(() => ({ data: null, error: null }))

    await hydrateFromSupabase('user-a', ownerA)
    markDirty(ownerA, 'cars')

    const flushPromise = flushCloudSync()
    await wait(10)
    assert.equal(countOf('profiles', 'upsert'), 1)

    endCloudSession()
    handlers.profiles.upsert = () => ({ data: null, error: null }) // B는 즉시 성공
    await hydrateFromSupabase('user-b', ownerB) // 다른 owner로 전환 — 세대가 다시 올라간다.

    releaseUpsert() // A의 늦은 응답이 이제야 도착한다.
    await flushPromise

    assert.equal(hasDirty(ownerA), true, 'A의 늦은 응답으로 A의 dirty가 지워지면 안 된다')
    assert.equal(getState().hydration.ownerKey, ownerB, 'A의 늦은 완료가 현재 owner(B) 상태를 건드리면 안 된다')
    endCloudSession()
  })
})
