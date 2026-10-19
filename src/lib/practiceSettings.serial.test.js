// @ts-check
// 로드맵 73 — 설정 저장은 한 번에 하나, 앞 저장이 끝난 최신 설정 위에 얹는다.
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, emptyOkHandlers } = createFakeSupabase()
mock.module('../data/cloud/supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { savePracticeSettings } = await import('./practiceSettings.js')
const { beginSessionEpoch, endCloudSession } = await import('../data/cloud/cloudSession.js')
const { setHydration } = await import('../data/store/app-store.js')
const { readOwnerSettings } = await import('../data/store/ownerDataHooks.js')

/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */

/** @param {string} ownerKey */
function beginReady(ownerKey) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  beginSessionEpoch(ownerKey, ownerKey)
  setHydration({ status: 'ready', userId: ownerKey, ownerKey })
}

/**
 * profiles upsert를 붙잡아 두는 가짜 서버. 보낸 settings를 차례로 모은다.
 * @param {{ failFirst?: boolean }} [options]
 */
function holdProfileUpserts({ failFirst = false } = {}) {
  /** @type {Array<JsonValue>} */
  const sent = []
  /** @type {Array<() => void>} */
  const releases = []
  handlers.profiles = {
    upsert: (row) => {
      const index = sent.length
      sent.push(row && typeof row === 'object' && !Array.isArray(row) ? row.settings ?? null : null)
      return new Promise((resolve) => { releases.push(() => resolve(undefined)) })
        .then(() => (failFirst && index === 0 ? { data: null, error: { message: 'profiles down' } } : { data: null, error: null }))
    },
  }
  return { sent, releases }
}

/** @param {number} ms */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** @param {JsonValue} settings @param {string} key */
function field(settings, key) {
  return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings[key] : undefined
}

test('73-1: 로그인, 앞 저장 중에 다른 스위치 → 두 번째는 앞 저장이 끝난 뒤 두 변경을 다 담아 저장', async () => {
  const ownerKey = 'own-73-1'
  beginReady(ownerKey)
  const server = holdProfileUpserts()
  const first = savePracticeSettings(ownerKey, { timeOn: true })
  const second = savePracticeSettings(ownerKey, { platformOn: true })
  await wait(10)
  assert.equal(server.sent.length, 1, '앞 저장이 끝나기 전에 두 번째를 보내면 안 된다')
  server.releases[0]?.()
  await first
  await wait(10)
  assert.equal(server.sent.length, 2)
  assert.equal(field(server.sent[1], 'timeOn'), true, '두 번째 저장에 앞 변경이 남아 있어야 한다')
  server.releases[1]?.()
  await second
  const settings = readOwnerSettings(ownerKey)
  assert.equal(settings.timeOn, true)
  assert.equal(settings.platformOn, true)
  endCloudSession()
})

test('73-2: 알림 종류 둘을 연달아 끄기(바꾸는 방법) → 목록에 둘 다', async () => {
  const ownerKey = 'own-73-2'
  beginReady(ownerKey)
  const server = holdProfileUpserts()
  /** @param {string} kind */
  const turnOff = (kind) => savePracticeSettings(ownerKey, (current) => ({ notifOff: [...(current.notifOff || []), kind] }))
  const first = turnOff('overdue')
  const second = turnOff('today')
  await wait(10)
  server.releases[0]?.()
  await first
  await wait(10)
  server.releases[1]?.()
  await second
  assert.deepEqual(readOwnerSettings(ownerKey).notifOff, ['overdue', 'today'])
  assert.deepEqual(field(server.sent[1], 'notifOff'), ['overdue', 'today'])
  endCloudSession()
})

test('73-3: 앞 저장이 실패하면 그 변경만 빠지고, 뒤 저장은 최신 설정 기준으로 성공', async () => {
  const ownerKey = 'own-73-3'
  beginReady(ownerKey)
  const server = holdProfileUpserts({ failFirst: true })
  const first = savePracticeSettings(ownerKey, { timeOn: true })
  const second = savePracticeSettings(ownerKey, { platformOn: true })
  await wait(10)
  server.releases[0]?.()
  await assert.rejects(() => first)
  await wait(10)
  assert.equal(server.sent.length, 2, '앞이 실패해도 뒤 저장은 이어서 한다')
  server.releases[1]?.()
  await second
  const settings = readOwnerSettings(ownerKey)
  assert.notEqual(settings.timeOn, true, '실패한 변경은 화면에 남지 않는다')
  assert.equal(settings.platformOn, true)
  endCloudSession()
})

test('73-4: 비회원 연달아 → 둘 다 기기에 저장', async () => {
  const ownerKey = 'guest-73-4'
  endCloudSession()
  await Promise.all([
    savePracticeSettings(ownerKey, { timeOn: true }),
    savePracticeSettings(ownerKey, (current) => ({ pinnedLocations: [...(current.pinnedLocations || []), '부산'] })),
  ])
  const settings = readOwnerSettings(ownerKey)
  assert.equal(settings.timeOn, true)
  assert.deepEqual(settings.pinnedLocations, ['부산'])
})
