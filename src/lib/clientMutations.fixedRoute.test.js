// @ts-check
// 로드맵 6 — 고정노선 1곳 규칙으로 자동 해제된 거래처도 로그인 저장 때 서버에 함께 올라가는지.
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, emptyOkHandlers } = createFakeSupabase()
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

const { requestClientSave } = await import('./clientMutations.js')
const { beginSessionEpoch, endCloudSession } = await import('./cloudSession.js')
const { setHydration } = await import('../store/app-store.js')

/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */

/** @param {unknown} value @param {string} key */
function field(value, key) {
  return value && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value)[key] : undefined
}

/** @type {Array<string>} */
let updates = []

/** @param {string} ownerKey */
function beginOwner(ownerKey) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  updates = []
  handlers.clients = {
    update: (row, filters) => {
      const linked = field(field(row, 'raw'), 'fixedRouteLinked')
      updates.push(`${String(field(filters, 'id'))}:fixed=${String(linked)}`)
      return { data: null, error: null }
    },
  }
  beginSessionEpoch(ownerKey, ownerKey)
  setHydration({ status: 'ready', userId: ownerKey, ownerKey })
}

/** @type {Array<ClientLike>} */
const CLIENTS = [
  { id: 'c-a', companyName: 'A물류', supabaseId: '11', fixedRouteLinked: true, fixedUnitPrice: '10000' },
  { id: 'c-b', companyName: 'B물류', supabaseId: '12', fixedRouteLinked: false, fixedUnitPrice: '' },
]

describe('requestClientSave — 로드맵 6 고정노선 자동 해제 서버 반영', () => {
  beforeEach(() => beginOwner('owner-fixed-route'))

  test('B를 고정노선으로 저장하면 B와 자동 해제된 A를 둘 다 서버에 저장한다', async () => {
    const result = await requestClientSave({
      ownerKey: 'owner-fixed-route', userId: 'owner-fixed-route', clients: CLIENTS, editingId: 'c-b',
      draft: { companyName: 'B물류', fixedRouteLinked: true, fixedUnitPrice: '20000' },
    })
    assert.equal(result.failed, false)
    assert.deepEqual(updates, ['12:fixed=true', '11:fixed=false'])
    endCloudSession()
  })

  test('고정노선과 무관한 저장은 그 거래처 1개만 서버에 저장한다', async () => {
    const result = await requestClientSave({
      ownerKey: 'owner-fixed-route', userId: 'owner-fixed-route', clients: CLIENTS, editingId: 'c-b',
      draft: { companyName: 'B물류(수정)' },
    })
    assert.equal(result.failed, false)
    assert.deepEqual(updates, ['12:fixed=false'])
    endCloudSession()
  })
})
