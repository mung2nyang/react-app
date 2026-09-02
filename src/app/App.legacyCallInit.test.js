import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import { mock, test } from 'node:test'
import assert from 'node:assert/strict'

let scheduleCloudSyncCallCount = 0
mock.module('../lib/syncQueue.js', {
  namedExports: {
    scheduleCloudSync: () => { scheduleCloudSyncCallCount += 1 },
    flushCloudSync: async () => {},
  },
})

import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import { wait } from '../testSupport/fakeSupabaseClient.js'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { default: DayLogPage } = await import('../components/day-log/DayLogPage.jsx')
const { commitBatch, getState, subscribe } = await import('../store/app-store.js')
const { initializeOwnerFromPersist } = await import('../store/owner-state.js')
const { storageKeyFor, readJsonKey } = await import('../store/persist.js')
const { normalizeSettings } = await import('../domain/practiceSettings.js')

/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */

/** @param {string} ownerKey @returns {Record<string, DayRecordLike>} */
function readWorkData(ownerKey) {
  return readJsonKey('workData', ownerKey, /** @type {Record<string, DayRecordLike>} */ ({}))
}

/** @param {string} ownerKey @param {string} dateKey */
function storeCallId(ownerKey, dateKey) {
  return getState().workLogs[ownerKey]?.main?.[dateKey]?.callDetails?.[0]?.id
}

test('id 없는 레거시 콜은 initialize 후 첫 mount에서 ID를 한 번만 persist한다', async () => {
  const ownerKey = 'legacy-call-init'
  const dateKey = '2026-08-21'
  const workKey = storageKeyFor('workData', ownerKey)
  localStorage.setItem(workKey, JSON.stringify({
    [dateKey]: { isOff: false, callDetails: [{ loadLoc: '레거시상차', fare: '1,000' }] },
  }))
  commitBatch([
    { domain: 'workData', ownerKey, value: {} },
  ], { persist: false, syncToCloud: false, replaceWorkLogs: { ownerKey, next: { main: {} } } })
  assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey], undefined)
  initializeOwnerFromPersist(ownerKey)
  assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey]?.callDetails?.[0]?.id, undefined)
  assert.equal(readWorkData(ownerKey)[dateKey]?.callDetails?.[0]?.id, undefined)

  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  let workWrites = 0
  const writeSpy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (key === workKey) workWrites += 1
    return originalSetItem.call(this, key, value)
  })
  let notifyCount = 0
  const unsub = subscribe(() => { notifyCount += 1 })
  const scheduleBefore = scheduleCloudSyncCallCount
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const settings = normalizeSettings({ callDetail: true })
  try {
    await act(async () => {
      root.render(React.createElement(DayLogPage, {
        month: 8, day: 21, dateKey, ownerKey, clients: [], settings, onClose: () => {},
      }))
    })
    await act(async () => {
      const deadline = Date.now() + 2000
      while (!storeCallId(ownerKey, dateKey) && Date.now() < deadline) await wait(20)
    })
    const firstId = storeCallId(ownerKey, dateKey)
    assert.equal(typeof firstId, 'string')
    assert.match(String(firstId), /^trp_/)
    assert.equal(readWorkData(ownerKey)[dateKey]?.callDetails?.[0]?.id, firstId)
    assert.equal(workWrites, 1)
    assert.equal(notifyCount, 1)
    assert.equal(scheduleCloudSyncCallCount, scheduleBefore + 1)

    await act(async () => { root.unmount() })
    const writesAfterUnmount = workWrites
    const notifyAfterUnmount = notifyCount
    const scheduleAfterUnmount = scheduleCloudSyncCallCount
    const root2 = createRoot(container)
    await act(async () => {
      root2.render(React.createElement(DayLogPage, {
        month: 8, day: 21, dateKey, ownerKey, clients: [], settings, onClose: () => {},
      }))
    })
    await act(async () => { await wait(50) })
    assert.equal(storeCallId(ownerKey, dateKey), firstId)
    assert.equal(getState().workLogs[ownerKey]?.main?.[dateKey]?.callDetails?.length, 1)
    assert.equal(readWorkData(ownerKey)[dateKey]?.callDetails?.length, 1)
    assert.equal(readWorkData(ownerKey)[dateKey]?.callDetails?.[0]?.id, firstId)
    assert.equal(workWrites, writesAfterUnmount)
    assert.equal(notifyCount, notifyAfterUnmount)
    assert.equal(scheduleCloudSyncCallCount, scheduleAfterUnmount)
    await act(async () => { root2.unmount() })
  } finally {
    unsub()
    writeSpy.mock.restore()
    container.remove()
  }
})
