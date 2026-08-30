import { resetStubSupabaseCallCounts, stubSupabaseCallCounts } from '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

let scheduleCloudSyncCallCount = 0
mock.module('../lib/syncQueue.js', {
  exports: {
    scheduleCloudSync: () => { scheduleCloudSyncCallCount += 1 },
    flushCloudSync: async () => {},
  },
})

const { writeJsonKey, storageKeyFor, storageKeyForLog } = await import('./persist.js')
const { getState, subscribe } = await import('./app-store.js')
const { initializeOwnerFromPersist } = await import('./owner-state.js')
const { commitCars, commitWorkData, commitLogWorkData } = await import('./commitHelpers.js')
const { getPendingOps, outboxStorageKey, buildTombstoneOp, planOutboxAppend } = await import('../lib/mutationOutbox.js')
const { inspectLogPending } = await import('../lib/logPendingLifecycle.js')
const {
  pendingDayWriteCount, hasUnsafePendingWrites, registerPendingDayWrite, retryPendingDayWrites,
} = await import('../lib/pendingWorkDataWrites.js')
const { fallback, keyOf } = await import('../lib/pendingWorkDataWritesState.js')
const { markUnsafeRegistrationFailure, listUnsafeRegistrations } = await import('../lib/durableWriteGuard.js')
const { markDirty } = await import('../lib/dirtyJournal.js')
const { pendingOwnerForLog } = await import('../lib/pendingLogOwner.js')

/** @typedef {import('../lib/pendingWorkDataWritesTypes.js').EffectivePatch} EffectivePatch */

const PATCH = /** @type {EffectivePatch} */ ({
  isOff: false, fixedCount: 3, palletCount: 0,
  callDetails: [{ id: 'trp_seed', fare: '1,000' }],
  fixedRouteCounts: {},
})

function methodCounts() {
  return {
    select: stubSupabaseCallCounts.select,
    upsert: stubSupabaseCallCounts.upsert,
    insert: stubSupabaseCallCounts.insert,
    update: stubSupabaseCallCounts.update,
    delete: stubSupabaseCallCounts.delete,
  }
}

/** @param {string} owner @param {string} [other] @param {string} [subNumber] */
function snapshotMemory(owner, other = 'init-schema-other', subNumber = '99하9999') {
  return {
    store: JSON.stringify(getState()),
    workLogs: JSON.stringify(getState().workLogs[owner]),
    cars: JSON.stringify(getState().cars[owner]),
    clients: JSON.stringify(getState().clients[owner]),
    journal: localStorage.getItem(`reactPracticeDirtyJournal:${owner}`),
    otherJournal: localStorage.getItem(`reactPracticeDirtyJournal:${other}`),
    outbox: localStorage.getItem(outboxStorageKey(owner)),
    carsRaw: localStorage.getItem(storageKeyFor('cars', owner)),
    clientsRaw: localStorage.getItem(storageKeyFor('clients', owner)),
    workRaw: localStorage.getItem(storageKeyFor('workData', owner)),
    logRaw: localStorage.getItem(storageKeyForLog(owner, 'main')),
    subLogRaw: localStorage.getItem(storageKeyForLog(owner, subNumber)),
    otherCarsRaw: localStorage.getItem(storageKeyFor('cars', other)),
    deletedDatesRaw: localStorage.getItem(storageKeyFor('workDataDeletedDates', owner)),
    pendingOps: JSON.stringify(getPendingOps(owner)),
    tombstones: JSON.stringify(getPendingOps(owner).filter((/** @type {{ kind: string }} */ op) => op.kind === 'tombstone')),
    pendingInspect: JSON.stringify(inspectLogPending(owner, 'main')),
    subInspect: JSON.stringify(inspectLogPending(owner, subNumber)),
    otherInspect: JSON.stringify(inspectLogPending(other, 'main')),
    pendingCount: pendingDayWriteCount(),
    unsafe: hasUnsafePendingWrites(),
    unsafeItems: JSON.stringify(listUnsafeRegistrations()),
    fallbackKeys: JSON.stringify([...fallback.keys()]),
    supabase: methodCounts(),
    schedule: scheduleCloudSyncCallCount,
  }
}

/** @param {ReturnType<typeof snapshotMemory>} before @param {ReturnType<typeof snapshotMemory>} after */
function assertSharedUnchanged(before, after) {
  assert.equal(after.store, before.store)
  assert.equal(after.workLogs, before.workLogs)
  assert.equal(after.cars, before.cars)
  assert.equal(after.clients, before.clients)
  assert.equal(after.clientsRaw, before.clientsRaw)
  assert.equal(after.workRaw, before.workRaw)
  assert.equal(after.subLogRaw, before.subLogRaw)
  assert.equal(after.otherCarsRaw, before.otherCarsRaw)
  assert.equal(after.otherJournal, before.otherJournal)
  assert.equal(after.deletedDatesRaw, before.deletedDatesRaw)
  assert.equal(after.journal, before.journal)
  assert.equal(after.outbox, before.outbox)
  assert.equal(after.pendingOps, before.pendingOps)
  assert.equal(after.tombstones, before.tombstones)
  assert.equal(after.pendingInspect, before.pendingInspect)
  assert.equal(after.subInspect, before.subInspect)
  assert.equal(after.otherInspect, before.otherInspect)
  assert.equal(after.pendingCount, before.pendingCount)
  assert.equal(after.unsafe, before.unsafe)
  assert.equal(after.unsafeItems, before.unsafeItems)
  assert.equal(after.fallbackKeys, before.fallbackKeys)
  assert.deepEqual(after.supabase, before.supabase)
  assert.equal(after.schedule, before.schedule)
}

/** @param {string} owner @param {string} other @param {(ok: boolean) => void} onSettled */
function seedLayers(owner, other, onSettled) {
  commitCars(owner, [
    { id: 'keep', number: '10가1000', type: 'main' },
    { id: 'sub-keep', number: '99하9999', type: 'sub', driverName: '김기사', driverPhone: '010-1111-2222' },
  ], { syncToCloud: false })
  commitWorkData(owner, { '2026-08-01': { isOff: true, fixedCount: 2 } }, { syncToCloud: false })
  commitLogWorkData(owner, '99하9999', { '2026-08-01': { isOff: false, fixedCount: 1 } })
  writeJsonKey('clients', owner, [{ id: 'keep-cli', companyName: '유지' }])
  commitCars(other, [{ id: 'other-car', number: '20나2000', type: 'main' }], { syncToCloud: false })
  markDirty(owner, 'cars')
  markDirty(other, 'clients')
  const planned = planOutboxAppend(owner, buildTombstoneOp({
    ownerKey: owner, userId: 'user-schema', resourceType: 'vehicle', resourceId: '900',
    operation: 'delete', sessionEpoch: 1,
  }))
  localStorage.setItem(planned.key, JSON.stringify(planned.value))
  const registered = registerPendingDayWrite(owner, '2026-08-03', PATCH, onSettled)
  assert.equal(registered, true)
  fallback.set(keyOf(owner, '2026-08-02'), PATCH)
  markUnsafeRegistrationFailure(owner, '2026-08-04', PATCH)
  registerPendingDayWrite(pendingOwnerForLog(owner, '99하9999'), '2026-08-01', PATCH)
  registerPendingDayWrite(other, '2026-08-05', PATCH)
}

test('스키마 실패 initializeOwnerFromPersist는 시드된 계층을 불변으로 두고 callback은 실패 중 0회다', () => {
  const owner = 'init-schema-fail-full'
  const other = 'init-schema-other'
  resetStubSupabaseCallCounts()
  /** @type {Array<boolean>} */
  const callbackHits = []
  seedLayers(owner, other, (ok) => { callbackHits.push(ok) })
  const before = snapshotMemory(owner, other)
  assert.equal(before.journal != null && before.journal !== '{}', true)
  assert.equal(JSON.parse(before.tombstones || '[]').length > 0, true)
  assert.equal(JSON.parse(before.pendingInspect).hasCallback, true)
  assert.equal(JSON.parse(before.pendingInspect).fallbackItems.length > 0, true)
  assert.equal(JSON.parse(before.unsafeItems).length > 0, true)
  assert.equal(JSON.parse(before.subInspect).hasAny, true)
  assert.equal(JSON.parse(before.otherInspect).hasAny, true)

  const injectedCars = JSON.stringify([{}])
  localStorage.setItem(storageKeyFor('cars', owner), injectedCars)
  let notifyCount = 0
  const unsub = subscribe(() => { notifyCount += 1 })
  initializeOwnerFromPersist(owner)
  unsub()
  const after = snapshotMemory(owner, other)
  assert.equal(notifyCount, 0)
  assert.equal(callbackHits.length, 0)
  assertSharedUnchanged(before, after)
  assert.equal(after.logRaw, before.logRaw)
  assert.equal(localStorage.getItem(storageKeyFor('cars', owner)), injectedCars)

  writeJsonKey('cars', owner, JSON.parse(before.cars))
  retryPendingDayWrites()
  assert.deepEqual(callbackHits, [true])

  /** @type {Array<boolean>} */
  const workHits = []
  registerPendingDayWrite(owner, '2026-08-06', PATCH, (ok) => { workHits.push(ok) })
  const injectedWork = JSON.stringify({ '2026-08-01': {} })
  localStorage.setItem(storageKeyForLog(owner, 'main'), injectedWork)
  const beforeWork = snapshotMemory(owner, other)
  let workNotify = 0
  const unsubWork = subscribe(() => { workNotify += 1 })
  initializeOwnerFromPersist(owner)
  unsubWork()
  const afterWork = snapshotMemory(owner, other)
  assert.equal(workNotify, 0)
  assert.equal(workHits.length, 0)
  assertSharedUnchanged(beforeWork, afterWork)
  assert.equal(afterWork.carsRaw, beforeWork.carsRaw)
  assert.equal(afterWork.clientsRaw, beforeWork.clientsRaw)
  assert.equal(localStorage.getItem(storageKeyForLog(owner, 'main')), injectedWork)
  retryPendingDayWrites()
  assert.deepEqual(workHits, [true])
})

test('종류별 잘못된 비용 모양은 initialize를 실패 불변으로 둔다', () => {
  const owner = 'init-schema-fail-items'
  const other = 'init-schema-items-other'
  resetStubSupabaseCallCounts()
  /** @type {Array<boolean>} */
  const callbackHits = []
  seedLayers(owner, other, (ok) => { callbackHits.push(ok) })
  const payloads = [
    { '2026-08-01': { isOff: false, fuelItems: [{ name: '주유만' }] } },
    { '2026-08-01': { isOff: false, maintItems: [{ cost: 1000 }] } },
    { '2026-08-01': { isOff: false, miscItems: [{ id: 'misc-1' }] } },
  ]
  for (const payload of payloads) {
    const injected = JSON.stringify(payload)
    localStorage.setItem(storageKeyForLog(owner, 'main'), injected)
    const before = snapshotMemory(owner, other)
    let notifyCount = 0
    const unsub = subscribe(() => { notifyCount += 1 })
    initializeOwnerFromPersist(owner)
    unsub()
    const after = snapshotMemory(owner, other)
    assert.equal(notifyCount, 0)
    assert.equal(callbackHits.length, 0)
    assertSharedUnchanged(before, after)
    assert.equal(localStorage.getItem(storageKeyForLog(owner, 'main')), injected)
  }
})
