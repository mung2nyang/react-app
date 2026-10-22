// 로드맵 55-B — 앱 오류를 client_errors 표에 남긴다: 로그인 사용자만, 최대 10건, 같은 문구 한 번, 경로만, 길이 자르기, 실패해도 조용함.
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'
import { createFakeSupabase, wait } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf } = createFakeSupabase()
mock.module('../data/cloud/supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

const { MAX_REPORTS_PER_LOAD, describeError, installErrorReporting, reportClientError, resetErrorReportsForTests } = await import('./errorReport.js')
const { beginSessionEpoch, endCloudSession } = await import('../data/cloud/cloudSession.ts')

/** @type {Array<Record<string, string>>} */
let inserted = []

beforeEach(() => {
  resetHandlers()
  resetErrorReportsForTests()
  inserted = []
  handlers.client_errors = {
    insert: (/** @type {Record<string, string>} */ row) => { inserted.push(row); return { data: null, error: null } },
  }
  endCloudSession()
})

test('비로그인이면 보내지 않는다', () => {
  assert.equal(reportClientError({ kind: 'error', message: 'x' }), false)
  assert.equal(countOf('client_errors', 'insert'), 0)
})

test('로그인 사용자면 한 줄 보낸다 — 경로만(? 뒤 없음), 종류·문구·위치·기기 정보', async () => {
  beginSessionEpoch('user-err', 'user-err')
  window.history.pushState({}, '', '/app/day/2026-10-14?secret=1')
  assert.equal(reportClientError({ kind: 'render', message: '그리기 오류', stack: 'at A' }), true)
  await wait(0)
  assert.equal(countOf('client_errors', 'insert'), 1)
  assert.equal(inserted[0].kind, 'render')
  assert.equal(inserted[0].message, '그리기 오류')
  assert.equal(inserted[0].stack, 'at A')
  assert.equal(inserted[0].path, '/app/day/2026-10-14')
  assert.equal(typeof inserted[0].user_agent, 'string')
})

test('같은 문구는 한 번만, 한 번 켠 앱에서 최대 10건', () => {
  beginSessionEpoch('user-err', 'user-err')
  assert.equal(reportClientError({ kind: 'error', message: '같은 오류' }), true)
  assert.equal(reportClientError({ kind: 'error', message: '같은 오류' }), false)
  for (let i = 0; i < 20; i += 1) reportClientError({ kind: 'error', message: `오류 ${i}` })
  assert.equal(countOf('client_errors', 'insert'), MAX_REPORTS_PER_LOAD)
})

test('긴 문구·위치는 서버 제한 길이로 자른다', async () => {
  beginSessionEpoch('user-err', 'user-err')
  reportClientError({ kind: 'error', message: 'a'.repeat(900), stack: 'b'.repeat(5000) })
  await wait(0)
  assert.equal(inserted[0].message.length, 500)
  assert.equal(inserted[0].stack.length, 2000)
})

test('보내기가 실패해도 조용하다(앱 동작에 영향 없음)', async () => {
  beginSessionEpoch('user-err', 'user-err')
  handlers.client_errors = { insert: () => { throw new Error('network down') } }
  assert.doesNotThrow(() => reportClientError({ kind: 'error', message: '실패 시험' }))
  await wait(0)
})

test('describeError: Error·글자·빈 값', () => {
  assert.deepEqual(describeError(new Error('boom')).message, 'boom')
  assert.deepEqual(describeError('문구'), { message: '문구', stack: '' })
  assert.deepEqual(describeError(undefined), { message: '', stack: '' })
})

test('installErrorReporting: window error·unhandledrejection을 받아 보낸다', async () => {
  beginSessionEpoch('user-err', 'user-err')
  /** @typedef {import('./errorReport.js').ErrorLikeEvent} ErrorLikeEvent */
  /** @type {Record<string, (event: ErrorLikeEvent) => void>} */
  const listeners = {}
  installErrorReporting({ addEventListener: (type, fn) => { listeners[type] = fn } })
  listeners.error({ error: new Error('전체 오류') })
  listeners.unhandledrejection({ reason: '거부 이유' })
  await wait(0)
  assert.deepEqual(inserted.map((row) => [row.kind, row.message]), [['error', '전체 오류'], ['unhandledrejection', '거부 이유']])
})
