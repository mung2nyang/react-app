// @ts-check
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf } = createFakeSupabase()
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { requestDriverUnlinkAction, fetchOwnerDriverLinks, unlinkAutoDateLabel } = await import('./driverUnlink.js')
const { beginSessionEpoch, endCloudSession } = await import('./cloudSession.js')
const { getState, setHydration } = await import('../store/app-store.js')
const { commitDrivers } = await import('../store/commitHelpers.js')

/** @typedef {import('./outboxTypes.js').DriverRecord} DriverRecord */

const OWNER = 'owner-7c'
/** @type {Array<DriverRecord>} */
const DRIVERS = [{ id: 'd1', name: '기사', status: 'linked', vehicleNumber: '11가1111', supabaseId: 'link-1' }]

/** @type {Array<string>} */
let calls = []

/** @param {import('../store/atomicPersist.js').JsonValue} row */
function rpcReturning(row) {
  return (/** @type {import('../store/atomicPersist.js').JsonValue|undefined} */ args) => {
    calls.push(JSON.stringify(args))
    return { data: [row], error: null }
  }
}

beforeEach(() => {
  resetHandlers()
  calls = []
  beginSessionEpoch(OWNER, OWNER)
  setHydration({ status: 'ready', userId: OWNER, ownerKey: OWNER })
  commitDrivers(OWNER, DRIVERS, { syncToCloud: false })
})

describe('requestDriverUnlinkAction — 로드맵 7-C-1', () => {
  test('해제 요청: 서버 함수에 연동 id를 넘기고 요청자·시각을 기사 목록에 반영한다(연동 유지)', async () => {
    handlers.rpc = { request_driver_unlink: rpcReturning({ id: 'link-1', status: 'linked', unlink_requested_by: OWNER, unlink_requested_at: '2026-10-01T03:00:00Z' }) }
    const result = await requestDriverUnlinkAction({ ownerKey: OWNER, drivers: DRIVERS, driverId: 'd1', action: 'request' })
    assert.equal(result.failed, false)
    assert.deepEqual(calls, ['{"p_link_id":"link-1"}'])
    const stored = getState().drivers[OWNER]?.[0]
    assert.equal(stored?.status, 'linked')
    assert.equal(stored?.unlinkRequestedBy, OWNER)
    assert.equal(stored?.unlinkRequestedAt, '2026-10-01T03:00:00Z')
    assert.equal(result.toast, '해제 요청을 보냈습니다. 상대가 동의하거나 3일이 지나면 해제됩니다.')
    endCloudSession()
  })

  test('동의로 해제되면(서버가 disconnected 반환) 기사 목록에서 뺀다', async () => {
    handlers.rpc = { consent_driver_unlink: rpcReturning({ id: 'link-1', status: 'disconnected' }) }
    const result = await requestDriverUnlinkAction({ ownerKey: OWNER, drivers: DRIVERS, driverId: 'd1', action: 'consent' })
    assert.equal(result.failed, false)
    assert.deepEqual(getState().drivers[OWNER], [])
    assert.equal(result.toast, '연동을 해제했습니다.')
    endCloudSession()
  })

  test('요청 취소는 요청 칸을 비운다', async () => {
    handlers.rpc = { cancel_driver_unlink: rpcReturning({ id: 'link-1', status: 'linked', unlink_requested_by: null, unlink_requested_at: null }) }
    const result = await requestDriverUnlinkAction({ ownerKey: OWNER, drivers: DRIVERS, driverId: 'd1', action: 'cancel' })
    assert.equal(result.toast, '해제 요청을 취소했습니다.')
    assert.equal(getState().drivers[OWNER]?.[0]?.unlinkRequestedBy, '')
    endCloudSession()
  })

  test('서버 거절이면 서버 문구를 보여 주고 기사 목록은 그대로', async () => {
    handlers.rpc = { consent_driver_unlink: () => ({ data: null, error: { message: '동의할 해제 요청이 없습니다.' } }) }
    const result = await requestDriverUnlinkAction({ ownerKey: OWNER, drivers: DRIVERS, driverId: 'd1', action: 'consent' })
    assert.equal(result.failed, true)
    assert.equal(result.toast, '동의할 해제 요청이 없습니다.')
    assert.deepEqual(getState().drivers[OWNER], DRIVERS)
    endCloudSession()
  })
})

describe('fetchOwnerDriverLinks·unlinkAutoDateLabel', () => {
  test('불러오기 전에 기한 지난 해제 요청 처리 함수를 먼저 부른다', async () => {
    /** @type {Array<string>} */
    const order = []
    handlers.rpc = { settle_expired_driver_unlinks: () => { order.push('settle'); return { data: 0, error: null } } }
    handlers.driver_links = { select: () => { order.push('select'); return { data: [], error: null } } }
    const res = await fetchOwnerDriverLinks(OWNER)
    assert.deepEqual(order, ['settle', 'select'])
    assert.deepEqual(res.data, [])
    assert.equal(countOf('rpc', 'settle_expired_driver_unlinks'), 1)
    endCloudSession()
  })

  test('자동 해제 날짜 = 요청 시각 + 3일', () => {
    assert.equal(unlinkAutoDateLabel('2026-10-01T03:00:00.000Z'), '10월 4일')
    assert.equal(unlinkAutoDateLabel(''), '')
  })
})
