// @ts-check
// 로드맵 7-C-2 — 앱을 열 때 3일 지난 해제 요청을 연동 확인보다 먼저 처리해야, 기사도 해제된 상태(일반 계정)로 시작한다.
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers } = createFakeSupabase()
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { buildCloudAppSession } = await import('./boot.js')

/** @type {Array<string>} */
let order = []
let settled = false

beforeEach(() => {
  resetHandlers()
  order = []
  settled = false
  handlers.profiles = { select: () => ({ data: { name: '기사', phone: '', account_type: 'owner_driver' }, error: null }) }
  // 서버 흉내: 기한 처리 전엔 연동 중, 처리 후엔 연동 없음.
  handlers.driver_links = {
    select: () => {
      order.push('driver_links')
      return { data: settled ? null : { id: 'link-1', owner_id: 'owner-1', status: 'linked' }, error: null }
    },
  }
  handlers.rpc = { settle_expired_driver_unlinks: () => { order.push('settle'); settled = true; return { data: 1, error: null } } }
})

test('기한 처리 → 연동 확인 순서: 3일 지난 요청이 해제되면 일반 계정으로 시작', async () => {
  const session = await buildCloudAppSession('driver-1')
  assert.deepEqual(order, ['settle', 'driver_links'])
  assert.equal(session.accountType, 'owner_driver')
  assert.equal(session.linkedOwnerId, null)
})

test('기한 처리가 실패해도 시작은 막지 않고 연동 상태대로 진행', async () => {
  handlers.rpc = { settle_expired_driver_unlinks: () => { order.push('settle'); return { data: null, error: { message: '네트워크 오류' } } } }
  const session = await buildCloudAppSession('driver-1')
  assert.deepEqual(order, ['settle', 'driver_links'])
  assert.equal(session.accountType, 'employed_driver')
  assert.equal(session.linkedOwnerId, 'owner-1')
})
