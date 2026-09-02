import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { createFakeSupabase, wait } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf, emptyOkHandlers } = createFakeSupabase()
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { hydrateFromSupabase } = await import('./hydrate.js')
const { endCloudSession } = await import('./cloudSession.js')
const { flushCloudSync, scheduleCloudSync } = await import('./syncQueue.js')
const { getState } = await import('../store/app-store.js')
const { markDirty } = await import('./dirtyJournal.js')

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

describe('슬라이스 E — hydrate 후 dirty로 profiles upsert(syncAll)하지 않는다', () => {
  test('idle에 생긴 dirty는 hydrate ready 뒤에도 profiles upsert를 예약하지 않는다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'syncqueue-idle-dirty'
    handlers.profiles.upsert = () => ({ data: null, error: null })

    markDirty(ownerKey, 'cars')
    scheduleCloudSync()
    assert.equal(countOf('profiles', 'upsert'), 0)

    await hydrateFromSupabase('user-idle-dirty', ownerKey)
    assert.equal(getState().hydration.status, 'ready')

    await wait(700)
    assert.equal(countOf('profiles', 'upsert'), 0, '로그인 업무는 syncAll/dirty 재업로드를 하지 않는다')
    endCloudSession()
  })
})

describe('flushCloudSync — outbox만 (syncAll 없음)', () => {
  test('dirty만 있고 pending outbox가 없으면 profiles upsert는 0회다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'syncqueue-inflight'
    handlers.profiles.upsert = () => ({ data: null, error: null })

    await hydrateFromSupabase('user-inflight', ownerKey)
    markDirty(ownerKey, 'cars')
    await flushCloudSync()
    assert.equal(countOf('profiles', 'upsert'), 0)
    endCloudSession()
  })

  test('flushCloudSync는 디바운스를 기다리지 않고 즉시 끝난다', async () => {
    resetHandlers()
    Object.assign(handlers, emptyOkHandlers())
    const ownerKey = 'syncqueue-pagehide'
    await hydrateFromSupabase('user-pagehide', ownerKey)
    const start = Date.now()
    await flushCloudSync()
    const elapsed = Date.now() - start
    assert.ok(elapsed < 500, `flushCloudSync는 디바운스를 기다리지 않고 즉시 돌아야 한다(경과 ${elapsed}ms)`)
    endCloudSession()
  })
})
