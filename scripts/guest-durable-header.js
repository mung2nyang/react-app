// 슬라이스 E(2026-09-01): App.test.js 로그인 하네스 durable/quota 통합 12건 → 게스트 전용.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { createFakeSupabase, wait } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, emptyOkHandlers, callCounts } = createFakeSupabase()

function totalSupabaseCalls() {
  return Object.values(callCounts).reduce((sum, n) => sum + n, 0)
}

fakeSupabase.auth.getSession = async () => ({ data: { session: null }, error: null })
mock.module('../supabaseClient.js', {
  namedExports: {
    supabase: fakeSupabase,
    phoneToFakeEmail: (phone) => `${phone}@runlog-user.com`,
    getSupabaseAuthErrorMessage: (error) => error?.message || '',
    signInWithPhone: async () => ({ error: new Error('테스트에서 호출되면 안 됨') }),
    signUpWithPhone: async () => ({ error: new Error('테스트에서 호출되면 안 됨') }),
    ensureProfileRow: async () => {},
  },
})

Object.assign(handlers, emptyOkHandlers())
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const liveRoots = new Set()
function createTrackedRoot(container) {
  const root = createRoot(container)
  liveRoots.add(root)
  return root
}
async function unmountTracked(root) {
  liveRoots.delete(root)
  await act(async () => { root.unmount() })
}
const { BrowserRouter } = await import('react-router-dom')
const { default: App } = await import('./App.jsx')
const { commitCars, commitClients, commitExpenses, commitSettings, commitWorkData } = await import('../store/commitHelpers.js')
const {
  hasPendingDayWrites, pendingDayWriteCount, retryPendingDayWrites,
  getPendingDayWrite,
} = await import('../lib/pendingWorkDataWrites.js')
const { isDurableWriteBroken, hasUnsafeRegistration, getUnsafeRegistrationPatch, clearUnsafeRegistrationFailure } = await import('../lib/durableWriteGuard.js')
const { hasDirty } = await import('../lib/dirtyJournal.js')
const { flushCloudSync } = await import('../lib/syncQueue.js')
const { endCloudSession } = await import('../lib/cloudSession.js')
const { durableKey } = await import('../lib/durableStorage.js')
const { getState, subscribe } = await import('../store/app-store.js')
const { readJsonKey, storageKeyFor } = await import('../store/persist.js')
const { normalizeSettings } = await import('../domain/practiceSettings.js')

/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */

/** @param {string} ownerKey @returns {Record<string, DayRecordLike>} */
function readWorkData(ownerKey) {
  const main = getState().workLogs[ownerKey]?.main
  if (main && typeof main === 'object') return /** @type {Record<string, DayRecordLike>} */ (main)
  return readJsonKey('workData', ownerKey, /** @type {Record<string, DayRecordLike>} */ ({}))
}
/** @param {string} ownerKey @param {string} dateKey @returns {DayRecordLike|undefined} */
function committedRecord(ownerKey, dateKey) {
  const main = getState().workLogs[ownerKey]?.main
  return main ? (/** @type {Record<string, DayRecordLike>} */ (main))[dateKey] : undefined
}

/** @param {string} expectedFirstArg */
function spyConsoleError(expectedFirstArg) {
  const original = console.error
  let count = 0
  const spy = mock.method(console, 'error', /** @param {Array<string|Error>} args */ function patchedConsoleError(...args) {
    if (args[0] === expectedFirstArg) count += 1
    return original.apply(console, args)
  })
  return { count: () => count, restore: () => spy.mock.restore() }
}

async function waitUntil(predicate, { timeoutMs = 2000, stepMs = 20 } = {}) {
  await act(async () => {
    const deadline = Date.now() + timeoutMs
    while (!predicate() && Date.now() < deadline) {
      await wait(stepMs)
    }
  })
}

function setNativeInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
}

/** @param {ParentNode} root @param {string} selector @returns {HTMLInputElement} */
function requireHtmlInput(root, selector) {
  const el = root.querySelector(selector)
  if (!(el instanceof window.HTMLInputElement)) throw new Error(`HTMLInputElement가 필요합니다: ${selector}`)
  return el
}

/**
 * @param {HTMLElement} container
 * @param {import('react-dom/client').Root} root
 * @param {string} dateKey
 * @param {() => void} [beforeGuest]
 */
async function setupGuestDayLog(container, root, dateKey, beforeGuest) {
  window.history.pushState({}, '', '/auth')
  if (beforeGuest) await act(async () => { beforeGuest() })
  await act(async () => {
    root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
  })
  await waitUntil(() => !!container.querySelector('.auth-guest-btn'), { timeoutMs: 5000 })
  const guestBtn = container.querySelector('.auth-guest-btn')
  assert.ok(guestBtn, '비회원으로 시작하기 버튼')
  await act(async () => {
    guestBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await waitUntil(() => window.location.pathname === '/app', { timeoutMs: 5000 })
  await act(async () => {
    window.history.pushState({}, '', `/app/day/${dateKey}`)
    window.dispatchEvent(new window.PopStateEvent('popstate'))
  })
  await waitUntil(
    () => window.location.pathname === `/app/day/${dateKey}`
      || !!container.querySelector('#modalFixedCountInput')
      || !!container.querySelector('#modalPalletCount')
      || !!container.querySelector('.maint-section'),
    { timeoutMs: 5000 },
  )
}

test.afterEach(async () => {
  const leftover = [...liveRoots]
  liveRoots.clear()
  for (const leftoverRoot of leftover) {
    await act(async () => { leftoverRoot.unmount() })
  }
  endCloudSession()
  commitCars('guest', [], { syncToCloud: false })
  commitClients('guest', [], { syncToCloud: false })
  localStorage.removeItem(storageKeyFor('cars', 'guest'))
  localStorage.removeItem(storageKeyFor('clients', 'guest'))
  localStorage.removeItem(storageKeyFor('workData', 'guest'))
  localStorage.removeItem(storageKeyFor('expenses', 'guest'))
  localStorage.removeItem(`reactPracticeDurablePendingWrites:guest`)
  await flushCloudSync()
})
