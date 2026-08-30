import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, emptyOkHandlers } = createFakeSupabase()
mock.module('../supabaseClient.js', { exports: { supabase: fakeSupabase } })

const { syncVehicles } = await import('./syncVehiclesClients.js')
const { flushMutationOutbox, resetOutboxQueuesForTests } = await import('./outboxFlush.js')
const { beginSessionEpoch, getSessionEpoch } = await import('./cloudSession.js')
const { buildTombstoneOp, hasPendingOps, isTombstoned, planOutboxAppend } = await import('./mutationOutbox.js')
const { writeAllOrNothing } = await import('../store/atomicPersist.js')
const { commitCars } = await import('../store/commitHelpers.js')
const { getState, setHydration } = await import('../store/app-store.js')
const { initializeOwnerFromPersist } = await import('../store/owner-state.js')
const { reconcileCars } = await import('./outboxReconcile.js')

function beginReady(userId, ownerKey) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  resetOutboxQueuesForTests()
  beginSessionEpoch(userId, ownerKey)
  setHydration({ status: 'ready', userId, ownerKey })
}

/**
 * @param {string} ownerKey
 * @param {'sync-first'|'outbox-first'} order
 */
async function runSameNumberReregister(ownerKey, order) {
  const userId = `user-${ownerKey}`
  beginReady(userId, ownerKey)
  /** @type {Array<{ id: string, number: string, type: string, user_id: string }>} */
  const server = [{ id: 'tomb-id', number: '12가3456', type: 'main', user_id: userId }]
  handlers.vehicles = {
    select: () => ({ data: server.map((row) => ({ ...row, raw: { id: 'legacy' }, legacy_log_id: '12가3456' })), error: null }),
    insert: (row) => {
      const inserted = {
        id: `fresh-${ownerKey}`,
        number: /** @type {{ number?: string }} */ (row && typeof row === 'object' ? row : {}).number || '12가3456',
        type: 'main',
        user_id: userId,
      }
      server.push(inserted)
      return { data: { id: inserted.id }, error: null }
    },
    update: () => ({ data: null, error: null }),
    delete: (filters) => {
      const id = String(filters.id)
      const index = server.findIndex((row) => row.id === id)
      if (index >= 0) server.splice(index, 1)
      return { data: null, error: null }
    },
  }
  commitCars(ownerKey, [{ id: 'local-new', number: '12가3456', type: 'main' }], { syncToCloud: false })
  const { key, value } = planOutboxAppend(ownerKey, buildTombstoneOp({
    ownerKey, userId, resourceType: 'vehicle', resourceId: 'tomb-id', operation: 'delete', sessionEpoch: getSessionEpoch(),
  }))
  writeAllOrNothing([{ key, value }])
  assert.equal(isTombstoned(ownerKey, 'vehicle', 'tomb-id'), true)

  if (order === 'sync-first') {
    await syncVehicles(userId, ownerKey)
    await flushMutationOutbox(ownerKey)
  } else {
    await flushMutationOutbox(ownerKey)
    await syncVehicles(userId, ownerKey)
  }

  const local = getState().cars[ownerKey].find((car) => car.id === 'local-new')
  assert.ok(local?.supabaseId)
  assert.equal(server.length, 1, `${order}: 서버 행은 1개`)
  assert.equal(server[0].id, local.supabaseId)
  assert.equal(hasPendingOps(ownerKey), false)
  assert.equal(isTombstoned(ownerKey, 'vehicle', 'tomb-id'), false)

  const hydrated = reconcileCars(ownerKey, server.map((row) => ({
    id: row.id, number: row.number, type: row.type, supabaseId: row.id,
  })))
  assert.equal(hydrated.length, 1)
  assert.equal(hydrated[0].supabaseId, local.supabaseId)
  initializeOwnerFromPersist(ownerKey)
  assert.equal(getState().cars[ownerKey].some((car) => car.id === 'local-new' && car.supabaseId === local.supabaseId), true)
}

describe('차량 삭제 tombstone과 같은 번호 재등록', () => {
  test('sync 조회가 먼저여도 새 행 id만 쓰고 tombstone은 비운다', async () => {
    await runSameNumberReregister('veh-race-sync-first', 'sync-first')
  })
  test('outbox 삭제가 먼저여도 새 행 id만 쓰고 tombstone은 비운다', async () => {
    await runSameNumberReregister('veh-race-outbox-first', 'outbox-first')
  })
})
