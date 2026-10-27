// 차주 지출 저장: 모든 칸 넣기·고치기가 끝난 뒤에 지운다 — 중간에 끊겨도 유실 대신 중복.
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { afterEach, describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf, emptyOkHandlers } = createFakeSupabase()
mock.module('../cloud/supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

const { beginSessionEpoch, endCloudSession } = await import('../cloud/cloudSession.ts')
const { setHydration, getState } = await import('../store/app-store.ts')
const { commitCars, commitExpenses } = await import('../store/commitHelpers.ts')
const { saveExpenses } = await import('./expensesSave.ts')

/** @param {unknown} filters @param {string} column */
function filterValue(filters, column) {
  return filters && typeof filters === 'object' && !Array.isArray(filters) ? String(/** @type {Record<string, unknown>} */ (filters)[column]) : ''
}

/** @type {import('../../domain/expenseTypes.ts').ExpenseItem} */
const SUB_ITEM = { id: 'f-back', kind: 'fuel', date: '2026-08-03', name: '주유', cost: 4000, vehicleNumber: '22나2222' }

/**
 * 메인 501(08-03 하루 기록 10)·미연동 서브 802. 서브 칸에 SUB_ITEM 줄(srv-sub-back).
 * @param {string} ownerKey @param {{ error: { message: string } } | null} [insertError]
 */
function seedMoveToMain(ownerKey, insertError = null) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  beginSessionEpoch(ownerKey, ownerKey)
  setHydration({ status: 'ready', userId: ownerKey, ownerKey })
  commitCars(ownerKey, [
    { id: 'car-main', type: 'main', number: '11가1111', supabaseId: 501 },
    { id: 'car-sub', type: 'sub', number: '22나2222', supabaseId: 802 },
  ])
  commitExpenses(ownerKey, [SUB_ITEM])
  /** @type {Array<string>} */
  const events = []
  handlers.daily_logs = {
    select: (filters) => ({ data: filterValue(filters, 'vehicle_id') === '501' ? [{ id: 10, work_date: '2026-08-03' }] : [], error: null }),
  }
  handlers.fuel_records = {
    select: (filters) => ({
      data: filterValue(filters, 'vehicle_id') === '802' ? [{ id: 'srv-sub-back', work_date: '2026-08-03', sequence: 0, raw: { ...SUB_ITEM } }] : [],
      error: null,
    }),
    insert: (row) => {
      events.push(`fuel.insert:${filterValue(row, 'vehicle_id')}:${filterValue(row, 'daily_log_id')}`)
      return insertError || { data: null, error: null }
    },
    delete: (filters) => { events.push(`fuel.delete:${filterValue(filters, 'id')}`); return { data: null, error: null } },
  }
  return events
}

describe('saveExpenses — 지우기는 모든 칸 넣기·고치기 뒤', () => {
  afterEach(() => endCloudSession())

  test('서브 칸 항목을 메인으로 옮기면 메인에 먼저 넣고, 서브 칸 줄은 그다음 지운다', async () => {
    const ownerKey = 'exp-order-move'
    const events = seedMoveToMain(ownerKey)
    const { vehicleNumber: _vehicleNumber, ...moved } = SUB_ITEM

    await saveExpenses(ownerKey, [moved])

    assert.deepEqual(events, ['fuel.insert:501:10', 'fuel.delete:srv-sub-back'])
    assert.equal(getState().expenses[ownerKey]?.[0]?.vehicleNumber, undefined)
  })

  test('메인 넣기가 실패하면 서브 칸 줄을 지우지 않고, 화면 목록도 그대로', async () => {
    const ownerKey = 'exp-order-move-fail'
    seedMoveToMain(ownerKey, { error: { message: 'insert down' } })
    const { vehicleNumber: _vehicleNumber, ...moved } = SUB_ITEM

    await assert.rejects(() => saveExpenses(ownerKey, [moved]))

    assert.equal(countOf('fuel_records', 'delete'), 0)
    assert.deepEqual(getState().expenses[ownerKey], [SUB_ITEM])
  })
})
