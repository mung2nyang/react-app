// 서버에 차량이 하나도 없는 로그인 계정: 일지가 어디에도 저장되지 않으면 "저장됨" 대신 실패로 알린다.
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { createFakeSupabase } from '../../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, emptyOkHandlers, countOf } = createFakeSupabase()
mock.module('../../../data/cloud/supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

const { createDayDraftSaver } = await import('./dayDraftLifecycle.js')
const { beginSessionEpoch, endCloudSession } = await import('../../../data/cloud/cloudSession.ts')
const { setHydration } = await import('../../../data/store/app-store.ts')
const { commitCars, commitWorkData } = await import('../../../data/store/commitHelpers.ts')
const { readJsonKey } = await import('../../../data/store/persist.ts')
const { NO_VEHICLE_SAVE_FAIL } = await import('../../../shared/utils/failureMessages.js')

test('차량 없는 로그인 계정 일지는 서버·휴대폰에 안 남고 "저장 실패"와 알림 ④', async () => {
  const ownerKey = 'a2-owner'
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  handlers.rpc = { save_day_log: () => ({ data: 1, error: null }) }
  beginSessionEpoch('a2-owner', ownerKey)
  setHydration({ status: 'ready', userId: 'a2-owner', ownerKey })
  commitCars(ownerKey, [])
  commitWorkData(ownerKey, {})

  /** @type {Array<string>} */
  const statuses = []
  /** @type {Array<string>} */
  const toasts = []
  const saver = createDayDraftSaver({
    ownerKey, logId: 'main', dateKey: '2026-10-26',
    draft: { isOff: false, fixedCount: 2, palletCount: 0, callDetails: [], fixedRouteCounts: {} },
    setAutoSaveStatus: (/** @type {string} */ status) => { statuses.push(status) },
  })
  saver.setToast((message) => { toasts.push(message) })
  const unmount = saver.mount()
  saver.commitNow()
  await new Promise((resolve) => setTimeout(resolve, 20))

  assert.equal(countOf('rpc', 'save_day_log'), 0)
  assert.equal(readJsonKey('workData', ownerKey, {})['2026-10-26'], undefined)
  assert.equal(statuses.at(-1), 'failed')
  assert.deepEqual(toasts, [NO_VEHICLE_SAVE_FAIL])
  unmount()
  endCloudSession()
})
