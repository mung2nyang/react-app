// 서버에 차량이 없는 로그인 계정: 지출 [저장]은 화면만 바꾸지 않고 알림 ④를 돌려준다.
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { afterEach, describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf, emptyOkHandlers } = createFakeSupabase()
mock.module('../cloud/supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

const { beginSessionEpoch, endCloudSession } = await import('../cloud/cloudSession.ts')
const { setHydration, getState } = await import('../store/app-store.ts')
const { commitCars, commitExpenses } = await import('../store/commitHelpers.ts')
const { saveExpenseDraft } = await import('./expensesSave.ts')
const { NO_VEHICLE_SAVE_FAIL } = await import('../../shared/utils/failureMessages.js')

/** @param {string} userId @param {string} ownerKey @param {Array<import('../../domain/financeTypes.ts').CarLike>} cars */
function seed(userId, ownerKey, cars) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  beginSessionEpoch(userId, ownerKey)
  setHydration({ status: 'ready', userId, ownerKey })
  commitCars(ownerKey, cars)
  commitExpenses(ownerKey, [])
}

const DRAFT = { kind: /** @type {'fuel'} */ ('fuel'), date: '2026-10-26', name: '주유', cost: 50000 }

describe('saveExpenseDraft — 저장할 서버 차량', () => {
  afterEach(() => endCloudSession())

  test('차량 없는 로그인 차주: 알림 ④, 지출 목록과 서버는 그대로', async () => {
    seed('nv-owner', 'nv-owner', [])
    const message = await saveExpenseDraft('nv-owner', DRAFT, null)
    assert.equal(message, NO_VEHICLE_SAVE_FAIL)
    assert.deepEqual(getState().expenses['nv-owner'], [])
    assert.equal(countOf('fuel_records', 'insert'), 0)
  })

  test('배정 차량 없는 연동 기사: 알림 ④, 지출 목록은 그대로', async () => {
    seed('nv-driver', 'nv-boss', [])
    const message = await saveExpenseDraft('nv-boss', DRAFT, null)
    assert.equal(message, NO_VEHICLE_SAVE_FAIL)
    assert.deepEqual(getState().expenses['nv-boss'], [])
  })

  test('메인 차량 있는 차주는 지금처럼 서버에 넣고 목록에 더한다', async () => {
    seed('hv-owner', 'hv-owner', [{ id: 'car-main', type: 'main', number: '11가1111', supabaseId: 501 }])
    const message = await saveExpenseDraft('hv-owner', DRAFT, null)
    assert.equal(message, null)
    assert.equal(getState().expenses['hv-owner'].length, 1)
    assert.equal(countOf('fuel_records', 'insert'), 1)
  })
})
