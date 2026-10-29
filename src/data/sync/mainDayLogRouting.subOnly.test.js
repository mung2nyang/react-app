// 메인 차량 없이 기사 차량만 있는 차주: 메인 일지는 기사 차량 칸으로 가지 않는다. 연동 기사는 배정 차량을 그대로 쓴다.
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { afterEach, describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, emptyOkHandlers } = createFakeSupabase()
mock.module('../cloud/supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

const { commitMainDayLogToCloud } = await import('./dayLogCloudCommit.ts')
const { vehicleSupabaseIdForLog } = await import('./mainDayLogRouting.ts')
const { beginSessionEpoch, endCloudSession } = await import('../cloud/cloudSession.ts')
const { setHydration } = await import('../store/app-store.ts')
const { commitCars } = await import('../store/commitHelpers.ts')

const SUB_CAR = { id: 'car-sub', type: /** @type {'sub'} */ ('sub'), number: '56다7890', supabaseId: 801, driverName: '김기사' }

/** @param {string} userId @param {string} ownerKey @returns {Array<string|number>} */
function seed(userId, ownerKey) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  /** @type {Array<string|number>} */
  const savedVehicles = []
  handlers.rpc = {
    save_day_log: (/** @type {{ p_log: { vehicle_id: string|number } }} */ args) => {
      savedVehicles.push(args.p_log.vehicle_id)
      return { data: 1, error: null }
    },
  }
  beginSessionEpoch(userId, ownerKey)
  setHydration({ status: 'ready', userId, ownerKey })
  commitCars(ownerKey, [SUB_CAR])
  return savedVehicles
}

describe('메인 일지 저장 차량 — 기사 차량만 있을 때', () => {
  afterEach(() => endCloudSession())

  test('차주: 메인 일지가 기사 차량(801)으로 저장되지 않는다', async () => {
    const savedVehicles = seed('so-owner', 'so-owner')
    assert.equal(vehicleSupabaseIdForLog('so-owner', 'main'), null)
    await commitMainDayLogToCloud({
      ownerKey: 'so-owner', logId: 'main', dateKey: '2026-10-26',
      previousData: {}, nextData: { '2026-10-26': { isOff: false, fixedCount: 1, palletCount: 0, callDetails: [], fixedRouteCounts: {} } },
    })
    assert.deepEqual(savedVehicles, [])
  })

  test('연동 기사: 배정 기사 차량(801)에 메인 일지를 저장한다', async () => {
    const savedVehicles = seed('so-driver', 'so-boss')
    assert.equal(vehicleSupabaseIdForLog('so-boss', 'main'), 801)
    await commitMainDayLogToCloud({
      ownerKey: 'so-boss', logId: 'main', dateKey: '2026-10-26',
      previousData: {}, nextData: { '2026-10-26': { isOff: false, fixedCount: 1, palletCount: 0, callDetails: [], fixedRouteCounts: {} } },
    })
    assert.deepEqual(savedVehicles, [801])
  })
})
