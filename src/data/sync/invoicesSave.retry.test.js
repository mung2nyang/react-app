// 세금계산서 저장이 중간에 끊긴 뒤 다시 저장해도 서버에 같은 계산서가 한 장만 있다.
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { afterEach, describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf, emptyOkHandlers } = createFakeSupabase()
mock.module('../cloud/supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

const { saveInvoices } = await import('./invoicesSave.ts')
const { beginSessionEpoch, endCloudSession } = await import('../cloud/cloudSession.ts')
const { setHydration, getState } = await import('../store/app-store.ts')
const { commitCars } = await import('../store/commitHelpers.ts')

/** @param {unknown} value @param {string} key */
function field(value, key) {
  return value && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value)[key] : undefined
}

/**
 * 넣은 줄을 기억하는 가짜 tax_invoices. failInsert(로컬 번호)가 'reject'면 넣지 않고 오류, 'lost'면 넣고도 오류(응답 유실).
 * @param {string} ownerKey
 */
function seedInvoiceServer(ownerKey) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  beginSessionEpoch(ownerKey, ownerKey)
  setHydration({ status: 'ready', userId: ownerKey, ownerKey })
  commitCars(ownerKey, [{ id: 'car-main', type: 'main', number: '12가3456', supabaseId: 700 }])
  /** @type {Array<{ id: number, localId: string }>} */
  const rows = []
  /** @type {Record<string, 'reject' | 'lost'>} */
  const failInsert = {}
  /** @type {Array<string>} */
  const events = []
  let nextId = 9000
  handlers.tax_invoices = {
    select: (filters) => ({ data: rows.filter((row) => row.localId === field(filters, 'raw->>id')).map((row) => ({ id: row.id })), error: null }),
    insert: (row) => {
      const localId = String(field(field(row, 'raw'), 'id'))
      events.push(`insert:${localId}`)
      if (failInsert[localId] === 'reject') return { data: null, error: { message: 'network down' } }
      nextId += 1
      rows.push({ id: nextId, localId })
      if (failInsert[localId] === 'lost') return { data: null, error: { message: 'response lost' } }
      return { data: { id: nextId }, error: null }
    },
    update: (row, filters) => { events.push(`update:${String(field(field(row, 'raw'), 'id'))}:${String(field(filters, 'id'))}`); return { data: null, error: null } },
  }
  return { rows, failInsert, events }
}

/** @param {string} id @param {string} clientName */
function draft(id, clientName) {
  return { id, flow: 'sales', monthKey: '2026-10', clientName, supplyAmount: 100000, taxAmount: 10000, totalAmount: 110000, status: 'draft' }
}

describe('saveInvoices — 끊긴 뒤 다시 저장해도 중복 없음', () => {
  afterEach(() => endCloudSession())

  test('둘째 넣기가 실패한 뒤 같은 목록으로 다시 저장하면 첫째는 고치기, 서버에 한 장씩', async () => {
    const ownerKey = 'inv-retry-reject'
    const server = seedInvoiceServer(ownerKey)
    const items = [draft('inv-1', '한진'), draft('inv-2', '대한')]
    server.failInsert['inv-2'] = 'reject'

    await assert.rejects(() => saveInvoices(ownerKey, items), { message: 'network down' })
    assert.equal(getState().invoices[ownerKey], undefined, '실패면 Store 그대로')
    delete server.failInsert['inv-2']
    await saveInvoices(ownerKey, items)

    assert.deepEqual(server.events, ['insert:inv-1', 'insert:inv-2', 'update:inv-1:9001', 'insert:inv-2'])
    assert.deepEqual(server.rows.map((row) => row.localId), ['inv-1', 'inv-2'])
    assert.deepEqual(getState().invoices[ownerKey]?.map((item) => item.supabaseId), [9001, 9002])
  })

  test('넣기는 됐는데 응답만 잃은 뒤 다시 저장하면 넣기 1번뿐', async () => {
    const ownerKey = 'inv-retry-lost'
    const server = seedInvoiceServer(ownerKey)
    const items = [draft('inv-1', '한진')]
    server.failInsert['inv-1'] = 'lost'

    await assert.rejects(() => saveInvoices(ownerKey, items), { message: 'response lost' })
    delete server.failInsert['inv-1']
    await saveInvoices(ownerKey, items)

    assert.equal(server.rows.length, 1)
    assert.equal(countOf('tax_invoices', 'insert'), 1)
    assert.equal(getState().invoices[ownerKey]?.[0]?.supabaseId, 9001)
  })

  test('서버 번호가 있는 계산서는 찾지 않고 그 줄을 고친다', async () => {
    const ownerKey = 'inv-retry-known'
    const server = seedInvoiceServer(ownerKey)

    await saveInvoices(ownerKey, [{ ...draft('inv-9', '한진'), supabaseId: 5001 }])

    assert.equal(countOf('tax_invoices', 'select'), 0)
    assert.deepEqual(server.events, ['update:inv-9:5001'])
  })
})
