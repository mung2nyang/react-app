// @ts-check
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf } = createFakeSupabase()
mock.module('../cloud/supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

const { removeDayLogOnServer } = await import('./dailyLogRemoval.ts')

/** @type {Array<import('../store/atomicPersist.ts').JsonValue>} */
let rpcArgs = []

describe('removeDayLogOnServer — 서버 함수 remove_day_log 한 번(지출이 있으면 빈 기록으로 남기는 갈림은 서버가)', () => {
  beforeEach(() => {
    resetHandlers()
    rpcArgs = []
    handlers.rpc = { remove_day_log: (args) => { rpcArgs.push(args ?? null); return { data: 'deleted', error: null } } }
  })

  test('그 날짜로 서버 함수 1회만 부르고 표에 직접 쓰지 않는다', async () => {
    await removeDayLogOnServer(700, '2026-10-10')
    assert.deepEqual(rpcArgs, [{ p_vehicle_id: 700, p_work_date: '2026-10-10' }])
    assert.equal(countOf('transport_details', 'delete'), 0)
    assert.equal(countOf('daily_logs', 'delete'), 0)
    assert.equal(countOf('daily_logs', 'update'), 0)
    for (const table of ['fuel_records', 'maintenance_records', 'misc_expense_records']) {
      assert.equal(countOf(table, 'select'), 0, `${table}를 앱에서 따로 보지 않는다`)
    }
  })

  test('서버 함수가 오류를 돌려주면 던진다', async () => {
    handlers.rpc = { remove_day_log: () => ({ data: null, error: { message: 'down' } }) }
    await assert.rejects(() => removeDayLogOnServer(700, '2026-10-10'))
    assert.equal(countOf('rpc', 'remove_day_log'), 1)
  })
})
