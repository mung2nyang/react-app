// 로드맵 111 — 로그인 계정 지출 [저장]을 저장 중에 또 눌러도 서버에 한 번만 넣는다(일지 지출 창·차량 유지비 화면).
// 느린 서버는 지출 줄 넣기를 붙잡아 흉내 낸다 — 고치기 전에는 두 번 눌러 두 줄이 들어갔다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { createFakeSupabase } from '../../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, emptyOkHandlers, countOf } = createFakeSupabase()
mock.module('../../../data/cloud/supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { BrowserRouter, Route, Routes } = await import('react-router-dom')
const { withSession } = await import('../../../testSupport/withSession.js')
const { withToast } = await import('../../../testSupport/withToast.js')
const { beginSessionEpoch, endCloudSession } = await import('../../../data/cloud/cloudSession.ts')
const { setHydration } = await import('../../../data/store/app-store.ts')
const { commitCars, commitExpenses, commitSettings, commitWorkData } = await import('../../../data/store/commitHelpers.ts')
const { readOwnerExpenses } = await import('../../../data/store/ownerDataHooks.ts')
const { normalizeSettings } = await import('../../../domain/practiceSettings.ts')
const { default: MaintFuelPage } = await import('./MaintFuelPage.jsx')
const { default: MainPageRoute } = await import('../../../app/routes/MainPageRoute.jsx')

const DATE = '2026-10-23'
const flush = () => act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })

/** 정비 줄 넣기를 붙잡는 느린 서버. failFirst면 첫 넣기는 실패. @param {{ failFirst?: boolean }} [options] */
function slowServer({ failFirst = false } = {}) {
  /** @type {Array<() => void>} */
  const releases = []
  let inserts = 0
  handlers.maintenance_records = {
    select: () => ({ data: [], error: null }),
    insert: () => {
      const index = inserts
      inserts += 1
      return new Promise((resolve) => { releases.push(() => resolve(undefined)) })
        .then(() => (failFirst && index === 0 ? { data: null, error: { message: 'network down' } } : { data: null, error: null }))
    },
  }
  return { releases, inserts: () => countOf('maintenance_records', 'insert') }
}

/** @param {string} ownerKey */
function beginLoggedIn(ownerKey) {
  resetHandlers()
  Object.assign(handlers, emptyOkHandlers())
  handlers.daily_logs = {
    select: () => ({ data: { id: 'dl-1', work_date: DATE }, error: null }),
    upsert: () => ({ data: { id: 'dl-1' }, error: null }),
  }
  beginSessionEpoch(ownerKey, ownerKey)
  setHydration({ status: 'ready', userId: ownerKey, ownerKey })
  commitCars(ownerKey, [{ id: 'car-main', type: 'main', number: '12가3456', supabaseId: 800 }])
  commitSettings(ownerKey, normalizeSettings({}))
  commitWorkData(ownerKey, {})
  commitExpenses(ownerKey, [])
}

/** 일지 입력 칸의 뒤로가기 붙잡기가 브라우저 기록을 보므로 BrowserRouter로 그린다. @param {string} ownerKey @param {string} path */
async function render(ownerKey, path) {
  window.history.replaceState(null, '', path)
  const toasts = /** @type {Array<string>} */ ([])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const routes = React.createElement(Routes, null,
    React.createElement(Route, { path: '/app/expenses', element: React.createElement(MaintFuelPage, {}) }),
    React.createElement(Route, { path: '/app/day/:date', element: React.createElement(MainPageRoute) }))
  const session = { userId: ownerKey, name: '보리', accountType: 'owner' }
  await act(async () => {
    root.render(withToast(React.createElement(BrowserRouter, null, withSession(routes, { ownerKey, session })), (/** @type {string} */ m) => { toasts.push(m) }))
  })
  /** @param {string} text */
  const button = (text) => [...container.querySelectorAll('button')].find((el) => el.textContent?.trim() === text)
  /** @param {Element|undefined|null} el */
  const press = (el) => { assert.ok(el); el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) }
  /** @param {string} value */
  const typeName = async (value) => {
    const el = /** @type {HTMLInputElement|null} */ (container.querySelector('#expenseName'))
    assert.ok(el)
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    await act(async () => { setter?.call(el, value); el.dispatchEvent(new window.Event('input', { bubbles: true })) })
  }
  return {
    container, toasts, button, press, typeName,
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

/** [저장]을 저장이 끝나기 전에 두 번 누른다. @param {Awaited<ReturnType<typeof render>>} view */
async function pressSaveTwice(view) {
  const saveButton = view.button('저장')
  await act(async () => { view.press(saveButton); view.press(saveButton) })
  await flush()
}

test('차량 유지비: 저장 중 [저장] 두 번 → 서버 넣기 1번·목록 1건, 저장 중엔 "저장 중…"으로 잠김', async () => {
  const owner = 'save-once-page'
  beginLoggedIn(owner)
  const server = slowServer()
  const view = await render(owner, '/app/expenses')
  try {
    await act(async () => { view.press(view.button('+ 추가')) })
    await view.typeName('타이어 수리')
    await pressSaveTwice(view)
    const busy = view.button('저장 중…')
    assert.ok(busy, '저장 중 표시')
    assert.equal(/** @type {HTMLButtonElement} */ (busy).disabled, true)
    await act(async () => { server.releases.forEach((release) => release()) })
    await flush()
    assert.equal(server.inserts(), 1, '서버 넣기는 한 번')
    assert.equal(readOwnerExpenses(owner).length, 1)
    assert.deepEqual(view.toasts, ['내역을 등록했습니다.'])
  } finally {
    await view.cleanup()
    endCloudSession()
  }
})

test('일지 지출 창: 저장 중 [저장] 두 번 → 서버 넣기 1번·목록 1건', async () => {
  const owner = 'save-once-day'
  beginLoggedIn(owner)
  const server = slowServer()
  const view = await render(owner, `/app/day/${DATE}`)
  try {
    await act(async () => { view.press(view.button('+ 정비 추가')) })
    await view.typeName('타이어 수리')
    await pressSaveTwice(view)
    await act(async () => { server.releases.forEach((release) => release()) })
    await flush()
    assert.equal(server.inserts(), 1, '서버 넣기는 한 번')
    assert.equal(readOwnerExpenses(owner).length, 1)
    assert.deepEqual(view.toasts, ['내역을 등록했습니다.'])
  } finally {
    await view.cleanup()
    endCloudSession()
  }
})

test('저장 실패면 알림 + 창 그대로, 잠금이 풀려 다시 누르면 저장된다', async () => {
  const owner = 'save-once-fail'
  beginLoggedIn(owner)
  const server = slowServer({ failFirst: true })
  const spy = mock.method(console, 'error', () => {})
  const view = await render(owner, '/app/expenses')
  try {
    await act(async () => { view.press(view.button('+ 추가')) })
    await view.typeName('타이어 수리')
    await pressSaveTwice(view)
    await act(async () => { server.releases.forEach((release) => release()) })
    await flush()
    assert.equal(server.inserts(), 1)
    assert.equal(view.toasts.length, 1, '실패 알림')
    assert.equal(readOwnerExpenses(owner).length, 0)
    const again = view.button('저장')
    assert.ok(again && !(/** @type {HTMLButtonElement} */ (again).disabled), '창 그대로·잠금 풀림')
    await act(async () => { view.press(again) })
    await flush()
    await act(async () => { server.releases.forEach((release) => release()) })
    await flush()
    assert.equal(server.inserts(), 2)
    assert.equal(readOwnerExpenses(owner).length, 1)
    assert.equal(view.toasts.at(-1), '내역을 등록했습니다.')
  } finally {
    spy.mock.restore()
    await view.cleanup()
    endCloudSession()
  }
})
