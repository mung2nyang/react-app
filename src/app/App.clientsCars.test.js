import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { clientRowsFor, createFakeSupabase, vehicleRowsFor, wait } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, emptyOkHandlers, callCounts } = createFakeSupabase()
fakeSupabase.auth.getSession = async () => ({
  data: { session: { user: { id: 'user-boot-nav', user_metadata: {}, phone: null } } },
  error: null,
})
mock.module('../supabaseClient.js', {
  exports: {
    supabase: fakeSupabase,
    /** @param {string} phone */
    phoneToFakeEmail: (phone) => `${phone}@runlog-user.com`,
    /** @param {{ message?: string } | null | undefined} error */
    getSupabaseAuthErrorMessage: (error) => error?.message || '',
    signInWithPhone: async () => ({ error: new Error('테스트에서 호출되면 안 됨') }),
    signUpWithPhone: async () => ({ error: new Error('테스트에서 호출되면 안 됨') }),
    ensureProfileRow: async () => {},
  },
})

resetHandlers()
Object.assign(handlers, emptyOkHandlers())
handlers.profiles.select = () => ({ data: { id: 'user-boot-nav', name: '테스트 사용자', settings: {} }, error: null })
handlers.clients.insert = () => ({ data: { id: `fake-client-${Math.random().toString(36).slice(2, 8)}` }, error: null })
handlers.vehicles.insert = () => ({ data: { id: `fake-vehicle-${Math.random().toString(36).slice(2, 8)}` }, error: null })
handlers.daily_logs = { upsert: () => ({ data: { id: 9000 }, error: null }) }

const reactActEnv = /** @type {{ IS_REACT_ACT_ENVIRONMENT?: boolean }} */ (globalThis)
reactActEnv.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
/** @type {Set<import('react-dom/client').Root>} */
const liveRoots = new Set()
/** @param {HTMLElement} container */
function createTrackedRoot(container) {
  const root = createRoot(container)
  liveRoots.add(root)
  return root
}
/** @param {import('react-dom/client').Root} root */
async function unmountTracked(root) {
  liveRoots.delete(root)
  await act(async () => { root.unmount() })
}
const { BrowserRouter, MemoryRouter } = await import('react-router-dom')
const { default: App } = await import('./App.jsx')
const { commitCars, commitClients, commitLogWorkData } = await import('../store/commitHelpers.js')
const { getState, setHydration, subscribe } = await import('../store/app-store.js')
const { readJsonKey, readLogWorkData, storageKeyFor, storageKeyForLog } = await import('../store/persist.js')
const { flushCloudSync } = await import('../lib/syncQueue.js')
const { todayWorkLogSelection } = await import('../domain/calendar.js')
const { parseAppLogPath, withFromLogState } = await import('./fromLogNavigation.js')
const { pendingOwnerForLog } = await import('../lib/pendingLogOwner.js')
const { registerPendingDayWrite, getPendingDayWrite } = await import('../lib/pendingWorkDataWrites.js')
const { initializeOwnerFromPersist } = await import('../store/owner-state.js')
const { default: ClientListPage } = await import('../components/clients/ClientListPage.jsx')
const { default: CarListPage } = await import('../components/cars/CarListPage.jsx')
const { beginSessionEpoch, getCloudUserId, endCloudSession } = await import('../lib/cloudSession.js')
const { outboxStorageKey } = await import('../lib/mutationOutbox.js')

function restoreDefaultHandlers() {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  handlers.profiles.select = () => ({ data: { id: 'user-boot-nav', name: '테스트 사용자', settings: {} }, error: null })
  handlers.clients.insert = () => ({ data: { id: `fake-client-${Math.random().toString(36).slice(2, 8)}` }, error: null })
  handlers.vehicles.insert = () => ({ data: { id: `fake-vehicle-${Math.random().toString(36).slice(2, 8)}` }, error: null })
  handlers.daily_logs = { upsert: () => ({ data: { id: 9000 }, error: null }) }
}

test.afterEach(async () => {
  restoreDefaultHandlers()
  const leftover = [...liveRoots]
  liveRoots.clear()
  for (const leftoverRoot of leftover) {
    await act(async () => { leftoverRoot.unmount() })
  }
  await Promise.race([
    flushCloudSync(),
    wait(2000),
  ])
})

// 슬라이스 C: hydrate가 "빈 배열 = 서버 정본(로컬 삭제)"으로 바뀌었다. supabaseId 있는
// 로컬 차량/거래처를 시드한 테스트는 가짜 서버도 같은 행을 돌려줘야 hydrate가 그 데이터를
// 지우지 않는다. getState를 라이브로 읽으므로 시드/UI 생성 순서와 무관하다.
// (afterEach의 restoreDefaultHandlers가 select를 원복한다.)
/** @param {string} ownerKey */
function mirrorServerFromStore(ownerKey) {
  handlers.vehicles.select = () => ({ data: vehicleRowsFor(getState().cars[ownerKey] || []), error: null })
  handlers.clients.select = () => ({ data: clientRowsFor(getState().clients[ownerKey] || []), error: null })
}

/** @param {ParentNode} root @param {string} selector */
function requireHtmlInput(root, selector) {
  const el = root.querySelector(selector)
  assert.ok(el instanceof window.HTMLInputElement, selector)
  return el
}

/** @param {HTMLInputElement} input @param {string} value */
function setNativeInputValue(input, value) {
  const proto = window.HTMLInputElement.prototype
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')
  desc?.set?.call(input, value)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
  input.dispatchEvent(new window.Event('change', { bubbles: true }))
}

/** @param {ParentNode} container @param {string} text */
function findButtonByText(container, text) {
  return Array.from(container.querySelectorAll('button')).find((btn) => (btn.textContent || '').includes(text))
}

/**
 * @param {() => boolean} predicate
 * @param {{ timeoutMs?: number, stepMs?: number }} [options]
 */
async function waitUntil(predicate, { timeoutMs = 4000, stepMs = 20 } = {}) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil timeout')
    await wait(stepMs)
  }
}

async function renderApp() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)
  await act(async () => {
    root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
  })
  await waitUntil(() => window.location.pathname.startsWith('/app'))
  await waitUntil(() => getState().hydration.status === 'ready' || getState().hydration.status === 'idle')
  return { container, root }
}

test('거래처 폼에서 고정노선 두 곳을 켜면 최종 1곳이고 id가 유지된다', async () => {
  const ownerKey = 'user-boot-nav'
  mirrorServerFromStore(ownerKey)
  commitClients(ownerKey, [
    { id: 'c-a', companyName: '에이', supabaseId: 'sb-a', fixedRouteLinked: true, fixedUnitPrice: '100000' },
  ], { syncToCloud: false })
  window.history.pushState({}, '', '/app/clients')
  const { container, root } = await renderApp()
  await waitUntil(() => !!findButtonByText(container, '+ 추가'))
  await act(async () => { findButtonByText(container, '+ 추가')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => !!container.querySelector('#clientCompanyName'))
  await act(async () => { setNativeInputValue(requireHtmlInput(container, '#clientCompanyName'), '비') })
  await act(async () => {
    container.querySelector('#clientFixedRouteToggle')?.dispatchEvent(new window.Event('click', { bubbles: true }))
  })
  const toggle = container.querySelector('#clientFixedRouteToggle')
  assert.ok(toggle instanceof window.HTMLInputElement)
  if (!toggle.checked) {
    await act(async () => { toggle.click() })
  }
  await act(async () => { setNativeInputValue(requireHtmlInput(container, '#clientFixedUnitPrice'), '200000') })
  await act(async () => { findButtonByText(container, '저장')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => getState().clients[ownerKey]?.some((item) => item.companyName === '비'))
  const list = getState().clients[ownerKey]
  assert.equal(list.filter((item) => item.fixedRouteLinked).length, 1)
  assert.equal(list.find((item) => item.id === 'c-a')?.fixedRouteLinked, false)
  assert.equal(list.find((item) => item.id === 'c-a')?.supabaseId, 'sb-a')
  assert.equal(list.find((item) => item.companyName === '비')?.fixedRouteLinked, true)
  await unmountTracked(root)
})

test('핀/비핀 교차 드래그는 순서를 저장하지 않는다', async () => {
  const ownerKey = 'user-boot-nav'
  commitClients(ownerKey, [
    { id: 'pin', companyName: '핀', isPinned: true },
    { id: 'rest', companyName: '일반', isPinned: false },
  ], { syncToCloud: false })
  window.history.pushState({}, '', '/app/clients')
  const { container, root } = await renderApp()
  await waitUntil(() => !!container.querySelector('.client-list-card'))
  const cards = container.querySelectorAll('.client-list-card')
  assert.equal(cards.length, 2)
  await act(async () => {
    cards[0].dispatchEvent(new window.Event('dragstart', { bubbles: true }))
  })
  await act(async () => {
    cards[1].dispatchEvent(new window.Event('dragover', { bubbles: true, cancelable: true }))
    cards[1].dispatchEvent(new window.Event('drop', { bubbles: true }))
  })
  assert.deepEqual(getState().clients[ownerKey].map((item) => item.id), ['pin', 'rest'])
  const persisted = readJsonKey('clients', ownerKey, /** @type {Array<{ id: string }>} */ ([]))
  assert.deepEqual(persisted.map((item) => item.id), ['pin', 'rest'])
  await unmountTracked(root)
})

test('같은 핀 그룹 드래그 순서는 persist와 hydrate 뒤에 유지된다', async () => {
  const ownerKey = 'user-boot-nav'
  commitClients(ownerKey, [
    { id: 'p1', companyName: '핀1', isPinned: true },
    { id: 'p2', companyName: '핀2', isPinned: true },
  ], { syncToCloud: false })
  window.history.pushState({}, '', '/app/clients')
  const { container, root } = await renderApp()
  await waitUntil(() => container.querySelectorAll('.client-list-card').length === 2)
  const cards = container.querySelectorAll('.client-list-card')
  await act(async () => {
    cards[0].dispatchEvent(new window.Event('dragstart', { bubbles: true }))
  })
  await act(async () => {
    cards[1].dispatchEvent(new window.Event('drop', { bubbles: true }))
  })
  assert.deepEqual(getState().clients[ownerKey].map((item) => item.id), ['p2', 'p1'])
  await unmountTracked(root)
  const { initializeOwnerFromPersist } = await import('../store/owner-state.js')
  initializeOwnerFromPersist(ownerKey)
  assert.deepEqual(getState().clients[ownerKey].map((item) => item.id), ['p2', 'p1'], 'initializeOwnerFromPersist는 persist만 읽고 hydrate가 아니다')
})

test('차량 추가 직후 오늘 일지로 들어가 저장되고 새로고침 뒤에도 남는다', async () => {
  const ownerKey = 'user-boot-nav'
  mirrorServerFromStore(ownerKey)
  commitCars(ownerKey, [{ id: 'main-1', type: 'main', number: '99하9999' }], { syncToCloud: false })
  window.history.pushState({}, '', '/app/cars')
  const { container, root } = await renderApp()
  await waitUntil(() => !!findButtonByText(container, '+ 추가'))
  await act(async () => { findButtonByText(container, '+ 추가')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => !!container.querySelector('#newCarNumber'))
  await act(async () => {
    setNativeInputValue(requireHtmlInput(container, '#newCarNumber'), '12가3456')
    setNativeInputValue(requireHtmlInput(container, '#newDriverName'), '이기사')
    setNativeInputValue(requireHtmlInput(container, '#newUserPhone'), '010-3333-4444')
  })
  await act(async () => { findButtonByText(container, '저장')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  const dateKey = todayWorkLogSelection().dateKey
  await waitUntil(() => window.location.pathname === `/app/logs/${encodeURIComponent('12가3456')}/day/${dateKey}`)
  await waitUntil(() => !!container.querySelector('#modalFixedCountInput'))
  await act(async () => { setNativeInputValue(requireHtmlInput(container, '#modalFixedCountInput'), '3') })
  await act(async () => {
    await waitUntil(() => getState().workLogs[ownerKey]?.['12가3456']?.[dateKey]?.fixedCount === 3, { timeoutMs: 3000 })
  })
  const logRead = readLogWorkData(ownerKey, '12가3456')
  assert.equal(logRead.ok, true)
  if (!logRead.ok) throw new Error('expected log read ok')
  assert.equal(logRead.value[dateKey]?.fixedCount, 3)
  await unmountTracked(root)
  const nextRoot = createTrackedRoot(container)
  await act(async () => {
    nextRoot.render(React.createElement(BrowserRouter, null, React.createElement(App)))
  })
  await waitUntil(() => getState().hydration.status === 'ready' || getState().hydration.status === 'idle')
  assert.equal(getState().workLogs[ownerKey]['12가3456'][dateKey].fixedCount, 3, 'root 재마운트(새로고침) 뒤에도 서브 일지가 남아야 한다')
  assert.equal(localStorage.getItem(storageKeyForLog(ownerKey, '99하9999')), null)
  await unmountTracked(nextRoot)
})

test('/app/cars pathname에서 옛 로그 URL 검사는 도달 불가이고 fromLog만 출처다', () => {
  const renamedFrom = '11가1111'
  const pathname = '/app/cars'
  const encodedOld = `/app/logs/${encodeURIComponent(renamedFrom)}`
  assert.equal(pathname.startsWith(encodedOld), false)
  assert.equal(pathname.includes(`/logs/${renamedFrom}`), false)
  const next = withFromLogState(`/app/logs/${encodeURIComponent(renamedFrom)}/day/2026-08-01`, '/app/cars', {})
  assert.equal(next && next.state && typeof next.state === 'object' && 'fromLog' in next.state
    ? /** @type {{ fromLog: { logId: string, dateKey: string } }} */ (next.state).fromLog.logId
    : '', renamedFrom)
  assert.deepEqual(parseAppLogPath(`/app/logs/${encodeURIComponent(renamedFrom)}/day/2026-08-01`), {
    logId: renamedFrom, dateKey: '2026-08-01',
  })
})

test('일지에서 차량 관리로 가서 번호를 바꾸면 출처 날짜의 새 로그 URL로 replace된다', async () => {
  const ownerKey = 'user-boot-nav'
  const oldNum = '31가3131'
  const newNum = '32나3232'
  const dateKey = '2026-08-01'
  commitCars(ownerKey, [{
    id: 'car-from-log', type: 'sub', number: oldNum, driverName: '남', driverPhone: '010-3131-3232',
  }], { syncToCloud: false })
  commitLogWorkData(ownerKey, oldNum, { [dateKey]: { isOff: false, fixedCount: 1 } })
  window.history.pushState({}, '', `/app/logs/${encodeURIComponent(oldNum)}/day/${dateKey}`)
  const { container, root } = await renderApp()
  await waitUntil(() => !!Array.from(container.querySelectorAll('button')).find((btn) => btn.title === '메뉴'))
  await act(async () => {
    Array.from(container.querySelectorAll('button')).find((btn) => btn.title === '메뉴')
      ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  })
  await act(async () => { findButtonByText(container, '차량 관리')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => window.location.pathname === '/app/cars')
  await waitUntil(() => !!findButtonByText(container, '수정'))
  await act(async () => { findButtonByText(container, '수정')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => !!container.querySelector('#newCarNumber'))
  await act(async () => { setNativeInputValue(requireHtmlInput(container, '#newCarNumber'), newNum) })
  const oldPending = pendingOwnerForLog(ownerKey, oldNum)
  await act(async () => {
    registerPendingDayWrite(oldPending, dateKey, {
      isOff: false, fixedCount: 9, palletCount: 0, callDetails: [], fixedRouteCounts: {},
    })
    findButtonByText(container, '저장')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  })
  await waitUntil(() => window.location.pathname === `/app/logs/${encodeURIComponent(newNum)}/day/${dateKey}`)
  assert.equal(getState().cars[ownerKey].find((item) => item.id === 'car-from-log')?.number, newNum)
  assert.equal(getState().workLogs[ownerKey][oldNum], undefined)
  assert.equal(localStorage.getItem(storageKeyForLog(ownerKey, oldNum)), null)
  assert.equal(getPendingDayWrite(oldPending, dateKey), undefined)
  const movedPending = getPendingDayWrite(pendingOwnerForLog(ownerKey, newNum), dateKey)?.fixedCount
  const movedStore = getState().workLogs[ownerKey][newNum]?.[dateKey]?.fixedCount
  assert.ok(movedPending === 9 || movedStore === 9, 'Effective Patch 9가 새 번호 큐나 Store에 있어야 한다')
  await unmountTracked(root)
  initializeOwnerFromPersist(ownerKey)
  assert.equal(getState().workLogs[ownerKey][oldNum], undefined)
  assert.ok(getState().workLogs[ownerKey][newNum]?.[dateKey]?.fixedCount === 1
    || getState().workLogs[ownerKey][newNum]?.[dateKey]?.fixedCount === 9)
})

test('UI 거래처 추가 후 Store/LS supabaseId가 같고 수정해도 insert는 1회', async () => {
  const ownerKey = 'user-boot-nav'
  /** @type {Array<Record<string, string|null|undefined>>} */
  const inserts = []
  handlers.clients.insert = (/** @type {Record<string, string>} */ row) => {
    inserts.push(row)
    return { data: { id: 'sb-ui-client' }, error: null }
  }
  window.history.pushState({}, '', '/app/clients')
  const { container, root } = await renderApp()
  await waitUntil(() => !!findButtonByText(container, '+ 추가'))
  await act(async () => { findButtonByText(container, '+ 추가')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => !!container.querySelector('#clientCompanyName'))
  await act(async () => { setNativeInputValue(requireHtmlInput(container, '#clientCompanyName'), '신거래') })
  await act(async () => { findButtonByText(container, '저장')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => getState().clients[ownerKey]?.some((item) => item.companyName === '신거래'))
  await act(async () => { await flushCloudSync() })
  await waitUntil(() => getState().clients[ownerKey].find((item) => item.companyName === '신거래')?.supabaseId === 'sb-ui-client')
  const persisted = readJsonKey('clients', ownerKey, /** @type {Array<{ companyName: string, supabaseId?: string }>} */ ([]))
  assert.equal(persisted.find((item) => item.companyName === '신거래')?.supabaseId, 'sb-ui-client')
  await act(async () => { findButtonByText(container, '수정')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => !!container.querySelector('#clientCompanyName'))
  await act(async () => { setNativeInputValue(requireHtmlInput(container, '#clientCompanyName'), '신거래수정') })
  await act(async () => { findButtonByText(container, '저장')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => getState().clients[ownerKey]?.some((item) => item.companyName === '신거래수정'))
  await act(async () => { await flushCloudSync() })
  assert.equal(inserts.length, 1)
  await unmountTracked(root)
})

test('insert 대기 중 거래처를 수정하면 최신 필드가 Store/LS와 두 번째 payload에 남는다', async () => {
  const ownerKey = 'user-boot-nav'
  /** @type {Array<Record<string, string|null|undefined>>} */
  const inserts = []
  /** @type {Array<Record<string, string|null|undefined>>} */
  const updates = []
  /** @type {(() => void) | undefined} */
  let release
  handlers.clients.insert = (/** @type {Record<string, string>} */ row) => {
    inserts.push(row)
    return new Promise((resolve) => {
      release = () => resolve({ data: { id: 'sb-hold-client' }, error: null })
    })
  }
  handlers.clients.update = (/** @type {Record<string, string>} */ row) => {
    updates.push(row)
    return { data: null, error: null }
  }
  window.history.pushState({}, '', '/app/clients')
  const { container, root } = await renderApp()
  await waitUntil(() => !!findButtonByText(container, '+ 추가'))
  await act(async () => { findButtonByText(container, '+ 추가')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => !!container.querySelector('#clientCompanyName'))
  await act(async () => { setNativeInputValue(requireHtmlInput(container, '#clientCompanyName'), '대기중') })
  await act(async () => { findButtonByText(container, '저장')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => getState().clients[ownerKey]?.some((item) => item.companyName === '대기중'))
  await wait(700)
  await waitUntil(() => inserts.length === 1)
  await act(async () => { findButtonByText(container, '수정')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => !!container.querySelector('#clientCompanyName'))
  await act(async () => { setNativeInputValue(requireHtmlInput(container, '#clientCompanyName'), '최신상호') })
  await act(async () => { findButtonByText(container, '저장')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => getState().clients[ownerKey]?.some((item) => item.companyName === '최신상호'))
  assert.equal(readJsonKey('clients', ownerKey, /** @type {Array<{ companyName: string }>} */ ([])).find((item) => item.companyName === '최신상호')?.companyName, '최신상호')
  await act(async () => { release?.() })
  await act(async () => { await flushCloudSync() })
  await waitUntil(() => updates.some((row) => row.company_name === '최신상호'))
  assert.equal(inserts.length, 1)
  await unmountTracked(root)
})

test('응답 유실 후 retry해도 서버 거래처 insert는 1회다', async () => {
  const ownerKey = 'user-boot-nav'
  /** @type {Array<{ id: string, legacy_client_id?: string }>} */
  const serverRows = []
  let dropId = true
  handlers.clients.insert = (/** @type {Record<string, string>} */ row) => {
    const id = `lost-${serverRows.length + 1}`
    serverRows.push({ id, legacy_client_id: row.legacy_client_id })
    if (dropId) return { data: null, error: null }
    return { data: { id }, error: null }
  }
  handlers.clients.select = (/** @type {Record<string, string>} */ filters) => {
    const rows = serverRows.filter((row) => !filters.legacy_client_id || row.legacy_client_id === filters.legacy_client_id)
    return { data: rows.map((row) => ({ id: row.id })), error: null }
  }
  window.history.pushState({}, '', '/app/clients')
  const { container, root } = await renderApp()
  await waitUntil(() => !!findButtonByText(container, '+ 추가'))
  await act(async () => { findButtonByText(container, '+ 추가')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => !!container.querySelector('#clientCompanyName'))
  await act(async () => { setNativeInputValue(requireHtmlInput(container, '#clientCompanyName'), '유실재시도') })
  await act(async () => { findButtonByText(container, '저장')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => getState().clients[ownerKey]?.some((item) => item.companyName === '유실재시도'))
  await act(async () => { await flushCloudSync() })
  dropId = false
  await act(async () => { await flushCloudSync() })
  await waitUntil(() => getState().clients[ownerKey].find((item) => item.companyName === '유실재시도')?.supabaseId === 'lost-1')
  assert.equal(serverRows.length, 1)
  await unmountTracked(root)
})

test('차량 insert 대기 중 번호를 바꿔도 서버 insert는 1회다', async () => {
  const ownerKey = 'user-boot-nav'
  /** @type {Array<{ id: string, raw?: { id?: string }, number?: string }>} */
  const serverVehicles = []
  /** @type {(() => void) | undefined} */
  let release
  handlers.vehicles.insert = (/** @type {{ raw?: { id?: string }, number?: string }} */ row) => {
    const id = `veh-hold-${serverVehicles.length + 1}`
    serverVehicles.push({ id, raw: row.raw, number: row.number })
    return new Promise((resolve) => {
      release = () => resolve({ data: { id }, error: null })
    })
  }
  // 슬라이스 C: hydrate가 빈 배열을 "삭제됨"으로 보므로, 시드한 supabaseId 차량(main-hold)도
  // 서버 목록에 있어야 hydrate가 지우지 않는다.
  handlers.vehicles.select = () => ({
    data: /** @type {import('../store/atomicPersist.js').JsonValue} */ ([
      { id: 'main-already', number: '10하1010', type: 'main', raw: { id: 'main-hold' }, legacy_log_id: '10하1010' },
      ...serverVehicles.map((row) => ({ id: row.id, number: row.number || '', type: 'sub', raw: row.raw || {}, legacy_log_id: row.number || '' })),
    ]),
    error: null,
  })
  handlers.vehicles.update = () => ({ data: null, error: null })
  commitCars(ownerKey, [{ id: 'main-hold', type: 'main', number: '10하1010', supabaseId: 'main-already' }], { syncToCloud: false })
  window.history.pushState({}, '', '/app/cars')
  const { container, root } = await renderApp()
  try {
  await waitUntil(() => !!findButtonByText(container, '+ 추가'))
  await act(async () => { findButtonByText(container, '+ 추가')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => !!container.querySelector('#newCarNumber'))
  await act(async () => {
    setNativeInputValue(requireHtmlInput(container, '#newCarNumber'), '41가4141')
    setNativeInputValue(requireHtmlInput(container, '#newDriverName'), '대기기사')
    setNativeInputValue(requireHtmlInput(container, '#newUserPhone'), '010-4141-4141')
  })
  await act(async () => { findButtonByText(container, '저장')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => getState().cars[ownerKey]?.some((item) => item.number === '41가4141'))
  await wait(700)
  await waitUntil(() => serverVehicles.length === 1)
  await act(async () => {
    Array.from(container.querySelectorAll('button')).find((btn) => btn.title === '메뉴')
      ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  })
  await act(async () => { findButtonByText(container, '차량 관리')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => window.location.pathname === '/app/cars')
  await waitUntil(() => container.querySelectorAll('.action-icon-btn').length >= 2)
  const editButtons = Array.from(container.querySelectorAll('button')).filter((btn) => (btn.textContent || '') === '수정')
  await act(async () => { editButtons[editButtons.length - 1]?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => !!container.querySelector('#newCarNumber'))
  await act(async () => { setNativeInputValue(requireHtmlInput(container, '#newCarNumber'), '42나4242') })
  await act(async () => { findButtonByText(container, '저장')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => getState().cars[ownerKey]?.some((item) => item.number === '42나4242'))
  await act(async () => { release?.() })
  await act(async () => { await flushCloudSync() })
  await waitUntil(() => !!getState().cars[ownerKey].find((item) => item.number === '42나4242')?.supabaseId)
  assert.equal(serverVehicles.length, 1)
  const persisted = readJsonKey('cars', ownerKey, /** @type {Array<{ number: string, supabaseId?: string }>} */ ([]))
  assert.equal(persisted.find((item) => item.number === '42나4242')?.supabaseId, serverVehicles[0].id)
  } finally {
    release?.()
    await unmountTracked(root)
  }
})

test('hydration failed UI에서 거래처 추가 모달이 유지되고 성공 토스트가 없다', async () => {
  const ownerKey = 'user-boot-nav'
  window.history.pushState({}, '', '/app/clients')
  const { container, root } = await renderApp()
  await waitUntil(() => getState().hydration.status === 'ready')
  const beforeStore = JSON.stringify(getState().clients[ownerKey] || [])
  const beforeLs = localStorage.getItem(storageKeyFor('clients', ownerKey))
  await act(async () => { findButtonByText(container, '+ 추가')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => !!container.querySelector('#clientCompanyName'))
  await act(async () => { setNativeInputValue(requireHtmlInput(container, '#clientCompanyName'), '실패모달') })
  await act(async () => { setHydration({ status: 'failed', userId: 'user-boot-nav', ownerKey }) })
  let notifyCount = 0
  const unsubscribe = subscribe(() => { notifyCount += 1 })
  const insertsBefore = callCounts['clients.insert'] || 0
  await act(async () => { findButtonByText(container, '저장')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  unsubscribe()
  assert.ok(container.querySelector('#clientCompanyName'), '모달이 닫히면 안 된다')
  assert.equal(JSON.stringify(getState().clients[ownerKey] || []), beforeStore)
  assert.equal(localStorage.getItem(storageKeyFor('clients', ownerKey)), beforeLs)
  assert.equal(notifyCount, 0)
  assert.equal(callCounts['clients.insert'] || 0, insertsBefore)
  assert.equal((container.querySelector('.toast-message')?.textContent || '').includes('등록했습니다'), false)
  await unmountTracked(root)
})

test('차량 관리 UI에서 한 대를 삭제해도 다른 차량과 일지는 남는다', async () => {
  const ownerKey = 'user-boot-nav'
  commitCars(ownerKey, [
    { id: 'car-ui-drop', type: 'sub', number: '81다8181', driverName: '삭', driverPhone: '010-8181-8181' },
    { id: 'car-ui-keep', type: 'sub', number: '82라8282', driverName: '남', driverPhone: '010-8282-8282' },
  ], { syncToCloud: false })
  commitLogWorkData(ownerKey, '81다8181', { '2026-08-24': { isOff: false, fixedCount: 2 } })
  commitLogWorkData(ownerKey, '82라8282', { '2026-08-24': { isOff: false, fixedCount: 6 } })
  registerPendingDayWrite(pendingOwnerForLog(ownerKey, '81다8181'), '2026-08-24', {
    isOff: false, fixedCount: 3, palletCount: 0, callDetails: [], fixedRouteCounts: {},
  })
  registerPendingDayWrite(pendingOwnerForLog(ownerKey, '82라8282'), '2026-08-24', {
    isOff: false, fixedCount: 6, palletCount: 0, callDetails: [], fixedRouteCounts: {},
  })
  window.history.pushState({}, '', '/app/cars')
  const { container, root } = await renderApp()
  await waitUntil(() => container.querySelectorAll('.action-icon-btn.del').length >= 2)
  commitLogWorkData(ownerKey, '81다8181', { '2026-08-24': { isOff: false, fixedCount: 2 } })
  commitLogWorkData(ownerKey, '82라8282', { '2026-08-24': { isOff: false, fixedCount: 6 } })
  const dropCard = Array.from(container.querySelectorAll('.management-list-card'))
    .find((el) => (el.textContent || '').includes('81다8181'))
  await act(async () => {
    dropCard?.querySelector('.action-icon-btn.del')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  })
  await waitUntil(() => !!findButtonByText(container, '확인'))
  await act(async () => { findButtonByText(container, '확인')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await waitUntil(() => (getState().cars[ownerKey] || []).length === 1)
  assert.equal(getState().cars[ownerKey][0].id, 'car-ui-keep')
  assert.equal(getState().workLogs[ownerKey]['81다8181'], undefined)
  assert.equal(getState().workLogs[ownerKey]['82라8282']['2026-08-24'].fixedCount, 6)
  assert.equal(getPendingDayWrite(pendingOwnerForLog(ownerKey, '81다8181'), '2026-08-24'), undefined)
  await unmountTracked(root)
  initializeOwnerFromPersist(ownerKey)
  assert.equal(getState().cars[ownerKey][0].id, 'car-ui-keep')
  assert.equal(getState().workLogs[ownerKey]['81다8181'], undefined)
  assert.equal(getState().workLogs[ownerKey]['82라8282']['2026-08-24'].fixedCount, 6)
})

test('hydration failed에서 거래처 삭제 ConfirmModal이 유지되고 Store/outbox/API가 불변이다', async () => {
  const ownerKey = 'user-boot-nav'
  mirrorServerFromStore(ownerKey)
  commitClients(ownerKey, [
    { id: 'cli-keep', companyName: '유지처', supabaseId: 'sb-keep' },
  ], { syncToCloud: false })
  window.history.pushState({}, '', '/app/clients')
  const { container, root } = await renderApp()
  await waitUntil(() => getState().hydration.status === 'ready')
  const beforeStore = JSON.stringify(getState().clients[ownerKey])
  const beforeLs = localStorage.getItem(storageKeyFor('clients', ownerKey))
  const beforeOutbox = localStorage.getItem(outboxStorageKey(ownerKey))
  const beforeJournal = localStorage.getItem(`reactPracticeDirtyJournal:${ownerKey}`)
  await act(async () => { setHydration({ status: 'failed', userId: 'user-boot-nav', ownerKey }) })
  await waitUntil(() => !!container.querySelector('.action-icon-btn.del'))
  let notifyCount = 0
  const unsubscribe = subscribe(() => { notifyCount += 1 })
  const apiBefore = callCounts['clients.delete'] || 0
  await act(async () => {
    container.querySelector('.action-icon-btn.del')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  })
  await waitUntil(() => !!findButtonByText(container, '확인'))
  await act(async () => { findButtonByText(container, '확인')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await wait(30)
  unsubscribe()
  assert.ok(findButtonByText(container, '확인'), 'ConfirmModal이 닫히면 안 된다')
  assert.equal(JSON.stringify(getState().clients[ownerKey]), beforeStore)
  assert.equal(localStorage.getItem(storageKeyFor('clients', ownerKey)), beforeLs)
  assert.equal(localStorage.getItem(outboxStorageKey(ownerKey)), beforeOutbox)
  assert.equal(localStorage.getItem(`reactPracticeDirtyJournal:${ownerKey}`), beforeJournal)
  assert.equal(notifyCount, 0)
  assert.equal(callCounts['clients.delete'] || 0, apiBefore)
  assert.equal((container.querySelector('.toast-message')?.textContent || '').includes('삭제했습니다'), false)
  await unmountTracked(root)
})

test('hydration failed에서 차량 삭제 ConfirmModal이 유지되고 Store/outbox/API가 불변이다', async () => {
  const ownerKey = 'user-boot-nav'
  mirrorServerFromStore(ownerKey)
  commitCars(ownerKey, [
    { id: 'car-keep', type: 'sub', number: '91마9191', driverName: '유', driverPhone: '010-9191-9191', supabaseId: 'sv-keep' },
  ], { syncToCloud: false })
  window.history.pushState({}, '', '/app/cars')
  const { container, root } = await renderApp()
  await waitUntil(() => getState().hydration.status === 'ready')
  const beforeStore = JSON.stringify(getState().cars[ownerKey])
  const beforeLs = localStorage.getItem(storageKeyFor('cars', ownerKey))
  const beforeLogs = JSON.stringify(getState().workLogs[ownerKey] || {})
  const beforeOutbox = localStorage.getItem(outboxStorageKey(ownerKey))
  await act(async () => { setHydration({ status: 'failed', userId: 'user-boot-nav', ownerKey }) })
  await waitUntil(() => !!container.querySelector('.action-icon-btn.del'))
  let notifyCount = 0
  const unsubscribe = subscribe(() => { notifyCount += 1 })
  const apiBefore = callCounts['vehicles.delete'] || 0
  await act(async () => {
    container.querySelector('.action-icon-btn.del')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  })
  await waitUntil(() => !!findButtonByText(container, '확인'))
  await act(async () => { findButtonByText(container, '확인')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await wait(30)
  unsubscribe()
  assert.ok(findButtonByText(container, '확인'), 'ConfirmModal이 닫히면 안 된다')
  assert.equal(JSON.stringify(getState().cars[ownerKey]), beforeStore)
  assert.equal(localStorage.getItem(storageKeyFor('cars', ownerKey)), beforeLs)
  assert.equal(JSON.stringify(getState().workLogs[ownerKey] || {}), beforeLogs)
  assert.equal(localStorage.getItem(outboxStorageKey(ownerKey)), beforeOutbox)
  assert.equal(notifyCount, 0)
  assert.equal(callCounts['vehicles.delete'] || 0, apiBefore)
  assert.equal((container.querySelector('.toast-message')?.textContent || '').includes('삭제했습니다'), false)
  await unmountTracked(root)
})

test('계정 B ready에서 stale owner A 거래처/차량 UI 저장·삭제는 A/B가 불변이다', async () => {
  const ownerA = 'stale-ui-a'
  const ownerB = 'ready-ui-b'
  beginSessionEpoch('user-b-ui', ownerB)
  setHydration({ status: 'ready', userId: 'user-b-ui', ownerKey: ownerB })
  commitClients(ownerA, [{ id: 'a1', companyName: '에이' }], { syncToCloud: false })
  commitClients(ownerB, [{ id: 'b1', companyName: '비' }], { syncToCloud: false })
  commitCars(ownerA, [{ id: 'ca', number: '11가1111', type: 'main' }], { syncToCloud: false })
  commitCars(ownerB, [{ id: 'cb', number: '22나2222', type: 'main' }], { syncToCloud: false })
  const snap = {
    cA: JSON.stringify(getState().clients[ownerA]),
    cB: JSON.stringify(getState().clients[ownerB]),
    vA: JSON.stringify(getState().cars[ownerA]),
    vB: JSON.stringify(getState().cars[ownerB]),
    lsCA: localStorage.getItem(storageKeyFor('clients', ownerA)),
    lsCB: localStorage.getItem(storageKeyFor('clients', ownerB)),
    lsVA: localStorage.getItem(storageKeyFor('cars', ownerA)),
    lsVB: localStorage.getItem(storageKeyFor('cars', ownerB)),
    jA: localStorage.getItem(`reactPracticeDirtyJournal:${ownerA}`),
    jB: localStorage.getItem(`reactPracticeDirtyJournal:${ownerB}`),
    oA: localStorage.getItem(outboxStorageKey(ownerA)),
    oB: localStorage.getItem(outboxStorageKey(ownerB)),
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createTrackedRoot(container)
  let notifyCount = 0
  const unsubscribe = subscribe(() => { notifyCount += 1 })
  const apiBefore = (callCounts['clients.insert'] || 0) + (callCounts['vehicles.insert'] || 0) + (callCounts['vehicles.delete'] || 0)
  try {
    await act(async () => {
      root.render(React.createElement(ClientListPage, { ownerKey: ownerA, showToast: () => {} }))
    })
    await act(async () => { findButtonByText(container, '+ 추가')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    await waitUntil(() => !!container.querySelector('#clientCompanyName'))
    await act(async () => { setNativeInputValue(requireHtmlInput(container, '#clientCompanyName'), '침범') })
    await act(async () => { findButtonByText(container, '저장')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    await act(async () => { findButtonByText(container, '취소')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    await act(async () => {
      container.querySelector('.action-icon-btn.del')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    await waitUntil(() => !!findButtonByText(container, '확인'))
    await act(async () => { findButtonByText(container, '확인')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  } finally {
    await unmountTracked(root)
    container.remove()
  }
  const carBox = document.createElement('div')
  document.body.appendChild(carBox)
  const carRoot = createTrackedRoot(carBox)
  try {
    await act(async () => {
      carRoot.render(React.createElement(MemoryRouter, null, React.createElement(CarListPage, { ownerKey: ownerA, showToast: () => {} })))
    })
    await act(async () => { findButtonByText(carBox, '+ 추가')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    await waitUntil(() => !!carBox.querySelector('#newCarNumber'))
    await act(async () => { setNativeInputValue(requireHtmlInput(carBox, '#newCarNumber'), '99하9999') })
    await act(async () => { findButtonByText(carBox, '저장')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    await act(async () => { findButtonByText(carBox, '취소')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    await act(async () => {
      carBox.querySelector('.action-icon-btn.del')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    await waitUntil(() => !!findButtonByText(carBox, '확인'))
    await act(async () => { findButtonByText(carBox, '확인')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  } finally {
    await unmountTracked(carRoot)
    carBox.remove()
  }
  unsubscribe()
  assert.equal(getCloudUserId(), 'user-b-ui')
  assert.equal(notifyCount, 0)
  assert.equal((callCounts['clients.insert'] || 0) + (callCounts['vehicles.insert'] || 0) + (callCounts['vehicles.delete'] || 0), apiBefore)
  assert.equal(JSON.stringify(getState().clients[ownerA]), snap.cA)
  assert.equal(JSON.stringify(getState().clients[ownerB]), snap.cB)
  assert.equal(JSON.stringify(getState().cars[ownerA]), snap.vA)
  assert.equal(JSON.stringify(getState().cars[ownerB]), snap.vB)
  assert.equal(localStorage.getItem(storageKeyFor('clients', ownerA)), snap.lsCA)
  assert.equal(localStorage.getItem(storageKeyFor('clients', ownerB)), snap.lsCB)
  assert.equal(localStorage.getItem(storageKeyFor('cars', ownerA)), snap.lsVA)
  assert.equal(localStorage.getItem(storageKeyFor('cars', ownerB)), snap.lsVB)
  assert.equal(localStorage.getItem(`reactPracticeDirtyJournal:${ownerA}`), snap.jA)
  assert.equal(localStorage.getItem(`reactPracticeDirtyJournal:${ownerB}`), snap.jB)
  assert.equal(localStorage.getItem(outboxStorageKey(ownerA)), snap.oA)
  assert.equal(localStorage.getItem(outboxStorageKey(ownerB)), snap.oB)
  endCloudSession()
})

