// 로드맵 24-B-3-B — 홈이 아닌 화면에서 아래 메뉴 위에 떠 있는 운비서 줄. 홈 카드와 같은 대화, [기록하기]면 줄이고 일지로.
// 앱 틀(AppShell)을 그대로 그려 아래 메뉴로 화면을 옮긴다. 입력 칸 붙잡기가 브라우저 기록을 보므로 BrowserRouter.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { BrowserRouter, Route, Routes } = await import('react-router-dom')
const { withSession } = await import('../../testSupport/withSession.js')
const { withToast } = await import('../../testSupport/withToast.js')
const { supabase } = await import('../../data/cloud/supabaseClient.ts')
const { normalizeSettings } = await import('../../domain/practiceSettings.ts')
const { commitSettings, commitWorkData } = await import('../../data/store/commitHelpers.ts')
const { default: AppShell } = await import('./AppShell.jsx')

const DATE = '2026-10-21'
/** @type {Array<{ data: object }>} */
let replies = []
Reflect.set(supabase, 'functions', { invoke: async () => ({ data: replies.shift()?.data ?? null, error: null }) })
const callReply = (/** @type {string} */ loadLoc, /** @type {string} */ unloadLoc) => ({ data: { kind: 'call', call: { date: DATE, loadLoc, unloadLoc, fare: 150000, client: '' } } })
beforeEach(() => { replies = [] })

/** @param {string} ownerKey @param {string} path @param {boolean} [loggedIn] */
async function renderShell(ownerKey, path, loggedIn = true) {
  commitSettings(ownerKey, normalizeSettings({ callDetail: true }))
  commitWorkData(ownerKey, {})
  window.history.replaceState(null, '', path)
  const session = loggedIn ? { userId: ownerKey, name: '보리', accountType: 'owner' } : null
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const routes = React.createElement(Routes, null, React.createElement(Route, { path: '/app/*', element: React.createElement(AppShell) }))
  await act(async () => {
    root.render(withToast(React.createElement(BrowserRouter, null, withSession(routes, { ownerKey, session })), () => {}))
  })
  const settle = async () => { await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) }) }
  /** @param {string} text @param {ParentNode} [scope] */
  const button = (text, scope = container) => [...scope.querySelectorAll('button')].find((el) => el.textContent?.trim() === text)
  /** @param {Element|undefined|null} el */
  const click = async (el) => {
    assert.ok(el)
    await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    await settle()
  }
  /** @param {string} selector @param {string} value */
  const type = async (selector, value) => {
    const el = /** @type {HTMLInputElement|null} */ (container.querySelector(selector))
    assert.ok(el, selector)
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    await act(async () => { setter?.call(el, value); el.dispatchEvent(new window.Event('input', { bubbles: true })) })
  }
  const dock = () => container.querySelector('.unbiseo-dock')
  /** 떠 있는 줄을 펼쳐 말을 보낸다 */
  const askDock = async (/** @type {string} */ text) => {
    if (dock()?.querySelector('.home-assistant-toggle')?.getAttribute('aria-expanded') !== 'true') await click(dock()?.querySelector('.home-assistant-toggle'))
    await type('.unbiseo-dock .home-assistant-input', text)
    await click(dock()?.querySelector('.home-assistant-send'))
  }
  await settle()
  return {
    container, button, click, type, dock, askDock, settle,
    value: (/** @type {string} */ id) => /** @type {HTMLInputElement|null} */ (container.querySelector(`#${id}`))?.value,
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('홈에는 줄이 없고, 다른 화면에는 줄인 채로 떠 있다', async () => {
  const view = await renderShell('dock-where', '/app')
  try {
    assert.equal(view.dock(), null, '홈은 카드가 같은 대화')
    await view.click(view.button('매출', view.container.querySelector('.bottom-nav-bar') || undefined))
    assert.equal(window.location.pathname, '/app/revenue')
    assert.ok(view.dock())
    assert.equal(view.dock()?.querySelector('.home-assistant-toggle')?.getAttribute('aria-expanded'), 'false')
    assert.equal(view.dock()?.querySelector('.home-assistant-panel'), null)
    await view.click(view.dock()?.querySelector('.home-assistant-toggle'))
    assert.ok(view.dock()?.querySelector('.home-assistant-panel'), '누르면 펼침')
    await view.click(view.dock()?.querySelector('.home-assistant-toggle'))
    assert.equal(view.dock()?.querySelector('.home-assistant-panel'), null, '다시 누르면 줄임')
  } finally { await view.cleanup() }
})

test('비회원에게는 띄우지 않는다', async () => {
  const view = await renderShell('guest', '/app/revenue', false)
  try {
    assert.equal(view.dock(), null)
  } finally { await view.cleanup() }
})

test('같은 대화: 홈 카드에서 받은 결과가 다른 화면의 줄에도 그대로', async () => {
  replies = [callReply('수원', '화성')]
  const view = await renderShell('dock-shared', '/app')
  try {
    await view.click(view.container.querySelector('.home-assistant .home-assistant-toggle'))
    await view.type('.home-assistant .home-assistant-input', '어제 수원 화성 15만')
    await view.click(view.button('보내기'))
    await view.click(view.button('달력', view.container.querySelector('.bottom-nav-bar') || undefined))
    await view.click(view.dock()?.querySelector('.home-assistant-toggle'))
    assert.equal(view.dock()?.querySelector('.home-assistant-said')?.textContent, '내가 한 말: 어제 수원 화성 15만')
    assert.equal(view.dock()?.querySelector('.home-assistant-result')?.textContent, '10월 21일 수원 → 화성, 150,000원으로 기록할게요.')
  } finally { await view.cleanup() }
})

test('줄에서 [기록하기] → 그 날짜 일지에 채운 입력 창, 줄은 줄어 있음', async () => {
  replies = [callReply('수원', '화성')]
  const view = await renderShell('dock-open', '/app/revenue')
  try {
    await view.askDock('어제 수원 화성 15만')
    await view.click(view.button('기록하기', view.dock() || undefined))
    await view.settle()
    assert.equal(window.location.pathname, `/app/day/${DATE}`)
    assert.equal(view.dock()?.querySelector('.home-assistant-panel'), null, '줄임')
    assert.equal(view.value('callLoadLoc'), '수원')
    assert.equal(view.value('callUnloadLoc'), '화성')
  } finally { await view.cleanup() }
})

test('이미 그 날짜 일지: 입력 창이 열려 있으면 확인 창 먼저 — [계속 입력]이면 그대로, [나가기]면 새로 채움', async () => {
  replies = [callReply('수원', '화성'), callReply('평택', '용인'), callReply('평택', '용인')]
  const view = await renderShell('dock-same-day', '/app/revenue')
  try {
    await view.askDock('어제 수원 화성 15만')
    await view.click(view.button('기록하기', view.dock() || undefined))
    await view.settle()
    assert.equal(view.value('callLoadLoc'), '수원')

    await view.askDock('어제 평택 용인 15만')
    await view.click(view.button('기록하기', view.dock() || undefined))
    await view.settle()
    assert.ok(view.container.textContent?.includes('저장하지 않은 입력이 있습니다'))
    await view.click(view.button('계속 입력'))
    assert.equal(view.value('callLoadLoc'), '수원', '[계속 입력]이면 채우지 않음')

    await view.askDock('어제 평택 용인 15만')
    await view.click(view.button('기록하기', view.dock() || undefined))
    await view.settle()
    await view.click(view.button('나가기'))
    await view.settle()
    assert.equal(window.location.pathname, `/app/day/${DATE}`, '일지에 그대로')
    assert.equal(view.value('callLoadLoc'), '평택')
    assert.equal(view.value('callUnloadLoc'), '용인')
  } finally { await view.cleanup() }
})

test('이미 그 날짜 일지, 열린 입력 칸 없음: 확인 없이 바로 채운 창', async () => {
  replies = [callReply('평택', '용인')]
  const view = await renderShell('dock-same-day-closed', `/app/day/${DATE}`)
  try {
    assert.equal(view.container.querySelector('#callLoadLoc'), null)
    await view.askDock('어제 평택 용인 15만')
    await view.click(view.button('기록하기', view.dock() || undefined))
    await view.settle()
    assert.ok(!view.container.textContent?.includes('저장하지 않은 입력이 있습니다'))
    assert.equal(view.value('callLoadLoc'), '평택')
  } finally { await view.cleanup() }
})
