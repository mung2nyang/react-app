// 재감사 15·16차 — App.test.js는 이미 실제 syncQueue를 붙잡은 뒤라 mock.module이
// scheduleCloudSync를 못 센다. 이 파일은 mock.module을 DayLogPage/app-store보다
// 먼저 올려, oops+quota 실패가 디바운스·unmount 뒤에도 scheduleCloudSync를 0회 부르는지 센다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import { mock, test } from 'node:test'
import assert from 'node:assert/strict'

let scheduleCloudSyncCallCount = 0
mock.module('../lib/syncQueue.js', {
  exports: {
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
const { commitClients, commitSettings, commitWorkData } = await import('../store/commitHelpers.js')
const { hasUnsafeRegistration, getUnsafeRegistrationPatch, clearUnsafeRegistrationFailure } = await import('../lib/durableWriteGuard.js')
const { normalizeSettings } = await import('../domain/practiceSettings.js')
const { readJsonKey, storageKeyFor } = await import('../store/persist.js')
const { getState } = await import('../store/app-store.js')

/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */
/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */

/** @type {Array<ClientLike>} */
const spyClients = [{ id: 'c1', companyName: '한진', fixedRouteLinked: true, palletOn: true }]

/** @param {string} ownerKey @returns {Record<string, DayRecordLike>} */
function readWorkData(ownerKey) {
  return readJsonKey('workData', ownerKey, /** @type {Record<string, DayRecordLike>} */ ({}))
}

/** @param {string} ownerKey @param {string} dateKey @returns {DayRecordLike|undefined} */
function committedRecord(ownerKey, dateKey) {
  const main = getState().workLogs[ownerKey]?.main
  return main ? (/** @type {Record<string, DayRecordLike>} */ (main))[dateKey] : undefined
}

/**
 * @typedef {{ first: string, second: Error }} DayLogSaveFailLog
 */

/** @param {string} expectedFirstArg */
function spyConsoleError(expectedFirstArg) {
  const original = console.error
  /** @type {Array<DayLogSaveFailLog>} */
  const calls = []
  const spy = mock.method(console, 'error', /**
   * @param {string|Error} first
   * @param {string|Error} [second]
   */
  function patchedConsoleError(first, second) {
    if (typeof first === 'string' && first === expectedFirstArg && second instanceof Error) {
      calls.push({ first, second })
    }
    if (second === undefined) return original.call(console, first)
    return original.call(console, first, second)
  })
  return { count: () => calls.length, calls: () => calls, restore: () => spy.mock.restore() }
}

/** @param {ParentNode} root @param {string} selector @returns {HTMLInputElement} */
function requireHtmlInput(root, selector) {
  const el = root.querySelector(selector)
  if (!(el instanceof window.HTMLInputElement)) throw new Error(`HTMLInputElement가 필요합니다: ${selector}`)
  return /** @type {HTMLInputElement} */ (el)
}

/** @param {HTMLInputElement} input @param {string} value */
function setNativeInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  if (!setter) throw new Error('HTMLInputElement value setter가 필요합니다')
  setter.call(input, value)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
}

/** @param {DayLogSaveFailLog} call */
function assertSaveFailError(call) {
  assert.equal(call.first, '일지 자동 저장 실패:')
  assert.equal(call.second.message, 'quota exceeded (simulated, schedule spy)')
}

test('재감사 15차 — 양성 대조: 정상 일지 커밋은 scheduleCloudSync를 1회 부른다', async () => {
  const ownerKey = 'spy-unsafe-positive'
  const dateKey = '2026-10-04'
  commitClients(ownerKey, spyClients, { syncToCloud: false })
  commitSettings(ownerKey, normalizeSettings({ fixedOn: true }), { syncToCloud: false })
  commitWorkData(ownerKey, {
    [dateKey]: { isOff: false, fixedCount: 2, palletCount: 0, callDetails: [], fixedRouteCounts: {} },
  }, { syncToCloud: false })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const before = scheduleCloudSyncCallCount
  try {
    await act(async () => {
      root.render(React.createElement(DayLogPage, {
        month: 10, day: 4, dateKey, ownerKey,
        clients: spyClients,
        settings: normalizeSettings({ fixedOn: true }),
        onClose: () => {},
      }))
    })
    await act(async () => {
      const deadline = Date.now() + 2000
      while (!container.querySelector('#modalFixedCountInput') && Date.now() < deadline) await wait(20)
    })
    await act(async () => { setNativeInputValue(requireHtmlInput(container, '#modalFixedCountInput'), '9') })
    await act(async () => { await wait(700) })
    assert.equal(scheduleCloudSyncCallCount, before + 1, '정상 커밋은 scheduleCloudSync를 정확히 1회 불러야 한다')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('재감사 16차 — oops+quota 실패는 unmount/cleanup 뒤에도 scheduleCloudSync 0회다', async () => {
  const ownerKey = 'spy-unsafe-fail'
  const dateKey = '2026-10-05'
  commitClients(ownerKey, spyClients, { syncToCloud: false })
  commitSettings(ownerKey, normalizeSettings({ fixedOn: true, callDetail: true }), { syncToCloud: false })
  commitWorkData(ownerKey, {
    [dateKey]: {
      isOff: false, fixedCount: 2, palletCount: 0,
      callDetails: [{ id: 'trp-spy', fare: '10,000', client: '한진', payments: [{ amount: 'oops' }] }],
      fixedRouteCounts: {},
    },
  }, { syncToCloud: false })
  const proto = Object.getPrototypeOf(localStorage)
  const originalSetItem = proto.setItem
  const failKey = storageKeyFor('workData', ownerKey)
  let shouldFail = false
  const spy = mock.method(proto, 'setItem', /** @this {Storage} @param {string} key @param {string} value */ function patchedSetItem(key, value) {
    if (shouldFail && key === failKey) throw new Error('quota exceeded (simulated, schedule spy)')
    return originalSetItem.call(this, key, value)
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const before = scheduleCloudSyncCallCount
  const workDataRawBefore = localStorage.getItem(failKey)
  const workDataBefore = structuredClone(readWorkData(ownerKey))
  const storeFixedBefore = committedRecord(ownerKey, dateKey)?.fixedCount
  const errSpy = spyConsoleError('일지 자동 저장 실패:')
  let unmounted = false
  try {
    await act(async () => {
      root.render(React.createElement(DayLogPage, {
        month: 10, day: 5, dateKey, ownerKey,
        clients: spyClients,
        settings: normalizeSettings({ fixedOn: true, callDetail: true }),
        onClose: () => {},
      }))
    })
    await act(async () => {
      const deadline = Date.now() + 2000
      while (!container.querySelector('#modalFixedCountInput') && Date.now() < deadline) await wait(20)
    })
    shouldFail = true
    await act(async () => { setNativeInputValue(requireHtmlInput(container, '#modalFixedCountInput'), '8') })
    await act(async () => {
      const deadline = Date.now() + 2000
      while (!(hasUnsafeRegistration(ownerKey, dateKey) && getUnsafeRegistrationPatch(ownerKey, dateKey)?.fixedCount === 8) && Date.now() < deadline) {
        await wait(20)
      }
    })
    assert.equal(shouldFail, true, '실패 조건을 풀면 안 된다')
    assert.equal(hasUnsafeRegistration(ownerKey, dateKey), true)
    assert.equal(scheduleCloudSyncCallCount, before, '디바운스 실패는 scheduleCloudSync를 부르면 안 된다')
    assert.equal(errSpy.count(), 1, '디바운스 실패 console.error는 정확히 1회여야 한다')
    const afterDebounce = errSpy.calls()[0]
    if (!afterDebounce) throw new Error('디바운스 실패 console.error가 없습니다')
    assertSaveFailError(afterDebounce)

    await act(async () => { root.unmount() })
    unmounted = true

    assert.equal(shouldFail, true, 'unmount 전후에 quota를 풀면 안 된다')
    assert.equal(scheduleCloudSyncCallCount, before, 'unmount flush 실패 후에도 scheduleCloudSync는 0회여야 한다')
    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, storeFixedBefore)
    assert.equal(committedRecord(ownerKey, dateKey)?.fixedCount, 2, 'Store는 작업 전 fixedCount=2여야 한다')
    assert.equal(localStorage.getItem(failKey), workDataRawBefore)
    assert.deepEqual(readWorkData(ownerKey), workDataBefore)
    assert.equal(readWorkData(ownerKey)[dateKey]?.fixedCount, 2)
    assert.equal(errSpy.count(), 2, 'debounce 실패와 unmount flush 실패는 console.error 정확히 2회여야 한다')
    const afterUnmount = errSpy.calls()[1]
    if (!afterUnmount) throw new Error('unmount flush 실패 console.error가 없습니다')
    assertSaveFailError(afterUnmount)
  } finally {
    if (!unmounted) {
      await act(async () => { root.unmount() })
    }
    clearUnsafeRegistrationFailure(ownerKey, dateKey)
    errSpy.restore()
    spy.mock.restore()
    shouldFail = false
    container.remove()
  }
})
