// [다시 시도](retryHydrate): 연동 확인 실패를 "연동 없음"으로 보지 않는다.
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { afterEach, describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf, emptyOkHandlers } = createFakeSupabase()
mock.module('../cloud/supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

const { retryHydrate } = await import('./hydrate.ts')
const { beginSessionEpoch, endCloudSession } = await import('../cloud/cloudSession.ts')
const { getState, setHydration } = await import('../store/app-store.ts')
const { commitCars } = await import('../store/commitHelpers.ts')

const SEED_CARS = [{ id: 'car-sub', type: 'sub', number: '22나2222', supabaseId: 802 }]

/**
 * 연동 기사 세션(사용자 id ≠ 칸)이 불러오기 실패 상태. 기사 본인의 연동 확인(driver_id 조회)만 linkCheck로 답한다.
 * @param {string} userId @param {string} ownerKey
 * @param {import('../../testSupport/fakeSupabaseClient.js').FakeQueryResult} linkCheck
 */
function seedFailedDriverSession(userId, ownerKey, linkCheck) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  handlers.driver_links = {
    select: (filters) => (filters && typeof filters === 'object' && !Array.isArray(filters) && filters.driver_id
      ? linkCheck
      : { data: [], error: null }),
  }
  beginSessionEpoch(userId, ownerKey)
  commitCars(ownerKey, SEED_CARS)
  setHydration({ status: 'failed', userId, ownerKey })
}

describe('retryHydrate — 연동 확인', () => {
  afterEach(() => endCloudSession())

  test('연동 확인이 실패하면 불러오지 않고 오류 — 서버 읽기 0번, 상태 "실패"·그 칸 기록 그대로', async () => {
    const ownerKey = 'retry-owner-a'
    seedFailedDriverSession('retry-driver-a', ownerKey, { data: null, error: { message: 'driver_links down' } })

    await assert.rejects(() => retryHydrate(), /연동 확인 실패/)

    assert.equal(countOf('profiles', 'select'), 0)
    assert.equal(countOf('vehicles', 'select'), 0)
    assert.equal(getState().hydration.status, 'failed')
    assert.deepEqual(getState().cars[ownerKey], SEED_CARS)
  })

  test('연동 확인이 성공하고 차주 id가 그 칸과 같으면 기사 경로로 불러온다(차주 경로의 차량 표 읽기 0번)', async () => {
    const ownerKey = 'retry-owner-b'
    seedFailedDriverSession('retry-driver-b', ownerKey, { data: { id: 7, owner_id: ownerKey, driver_id: 'retry-driver-b', status: 'linked' }, error: null })

    await retryHydrate()

    assert.equal(countOf('vehicles', 'select'), 0)
    assert.equal(getState().hydration.status, 'ready')
  })
})
