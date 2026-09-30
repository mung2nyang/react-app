// @ts-check
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers } = createFakeSupabase()
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { removeDayLogOnServer } = await import('./dailyLogRemoval.js')

/** @param {unknown} value @param {string} key */
function field(value, key) {
  return value && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value)[key] : undefined
}

/** @type {Array<string>} */
let events = []

/** @param {string} withRowsTable 이 표만 그날 행이 있다고 답한다('' 이면 전부 없음) */
function seed(withRowsTable) {
  resetHandlers()
  events = []
  handlers.transport_details = { delete: () => { events.push('transport.delete'); return { data: null, error: null } } }
  for (const table of ['fuel_records', 'maintenance_records', 'misc_expense_records']) {
    handlers[table] = { select: () => ({ data: table === withRowsTable ? [{ id: `${table}-1` }] : [], error: null }) }
  }
  handlers.daily_logs = {
    delete: (filters) => { events.push(`daily.delete:${String(field(filters, 'work_date'))}`); return { data: null, error: null } },
    update: (row, filters) => {
      events.push(`daily.update:${String(field(filters, 'work_date'))}:fixed=${String(field(row, 'fixed_count'))}:off=${String(field(row, 'is_off'))}`)
      return { data: null, error: null }
    },
  }
}

describe('removeDayLogOnServer — 로드맵 0-3-A', () => {
  beforeEach(() => seed(''))

  test('그날 비용이 없으면 콜 상세와 하루 기록 줄을 지운다(기존 동작)', async () => {
    await removeDayLogOnServer(700, '2026-10-10')
    assert.deepEqual(events, ['transport.delete', 'daily.delete:2026-10-10'])
  })

  for (const table of ['fuel_records', 'maintenance_records', 'misc_expense_records']) {
    test(`그날 ${table} 행이 있으면 줄을 지우지 않고 빈 기록으로 남긴다`, async () => {
      seed(table)
      await removeDayLogOnServer(700, '2026-10-10')
      assert.deepEqual(events, ['transport.delete', 'daily.update:2026-10-10:fixed=0:off=false'])
    })
  }

  test('비용 조회가 실패하면 던지고 줄을 건드리지 않는다', async () => {
    handlers.fuel_records = { select: () => ({ data: null, error: { message: 'fuel down' } }) }
    await assert.rejects(() => removeDayLogOnServer(700, '2026-10-10'))
    assert.deepEqual(events, ['transport.delete'])
  })
})
