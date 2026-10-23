// 로드맵 24-B-3-B — 홈이 아닌 화면에서 아래 메뉴 위 오른쪽에 떠 있는 운비서 캐릭터 버튼(수정 2). 홈 카드와 같은 대화, [기록하기]면 작게 하고 일지로.
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

// 화면을 옮기면 새 화면 파일을 받는 동안 앞 화면이 남는다(주소 바뀜은 startTransition) — 정해진 시간 대신 될 때까지 기다린다.
/** @param {() => boolean} predicate */
async function waitUntil(predicate, { timeoutMs = 3000, stepMs = 20 } = {}) {
  // 한 번 기다릴 때마다 act를 끝내야 React가 그 사이 바뀐 화면을 그린다.
  const deadline = Date.now() + timeoutMs
  while (!predicate() && Date.now() < deadline) {
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, stepMs) }) })
  }
  if (!predicate()) throw new Error('waitUntil timeout')
}

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
  /** 떠 있는 버튼을 눌러 카드를 열고 말을 보낸다 */
  const askDock = async (/** @type {string} */ text) => {
    await waitUntil(() => !!dock())
    const fab = dock()?.querySelector('.unbiseo-dock-fab')
    if (fab) await click(fab)
    await type('.unbiseo-dock .home-assistant-input', text)
    await click(dock()?.querySelector('.home-assistant-send'))
  }
  await settle()
  /** 일지 입력 칸이 그 값으로 채워질 때까지 */
  const waitForLoad = (/** @type {string} */ loadLoc) => waitUntil(() => /** @type {HTMLInputElement|null} */ (container.querySelector('#callLoadLoc'))?.value === loadLoc)
  return {
    container, button, click, type, dock, askDock, settle, waitForLoad,
    value: (/** @type {string} */ id) => /** @type {HTMLInputElement|null} */ (container.querySelector(`#${id}`))?.value,
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('홈에는 없고, 다른 화면에는 작은 캐릭터 버튼만 — 누르면 카드, 꺾쇠로 다시 작게', async () => {
  const view = await renderShell('dock-where', '/app')
  try {
    assert.equal(view.dock(), null, '홈은 카드가 같은 대화')
    await view.click(view.button('매출', view.container.querySelector('.bottom-nav-bar') || undefined))
    assert.equal(window.location.pathname, '/app/revenue')
    await waitUntil(() => !!view.dock())
    assert.ok(view.dock())
    const fab = view.dock()?.querySelector('.unbiseo-dock-fab')
    assert.ok(fab, '캐릭터 버튼')
    assert.equal(fab?.getAttribute('aria-expanded'), 'false')
    assert.equal(view.dock()?.querySelector('.home-assistant-panel'), null, '카드 없음')
    assert.equal(view.dock()?.querySelector('.home-assistant-hint'), null, '긴 줄 없음')
    await view.click(fab)
    assert.ok(view.dock()?.querySelector('.home-assistant-panel'), '누르면 카드')
    assert.equal(view.dock()?.querySelector('.unbiseo-dock-fab'), null, '카드가 열리면 버튼 대신')
    await view.click(view.dock()?.querySelector('.unbiseo-dock-close'))
    assert.equal(view.dock()?.querySelector('.home-assistant-panel'), null, '꺾쇠로 다시 작게')
    assert.ok(view.dock()?.querySelector('.unbiseo-dock-fab'))
  } finally { await view.cleanup() }
})

test('비회원에게는 띄우지 않는다', async () => {
  const view = await renderShell('guest', '/app/revenue', false)
  try {
    assert.equal(view.dock(), null)
  } finally { await view.cleanup() }
})

test('같은 대화: 홈 카드에서 받은 결과가 다른 화면의 카드에도 그대로', async () => {
  replies = [callReply('수원', '화성')]
  const view = await renderShell('dock-shared', '/app')
  try {
    await view.click(view.container.querySelector('.home-assistant .home-assistant-toggle'))
    await view.type('.home-assistant .home-assistant-input', '어제 수원 화성 15만')
    await view.click(view.button('보내기'))
    await view.click(view.button('달력', view.container.querySelector('.bottom-nav-bar') || undefined))
    await waitUntil(() => !!view.dock())
    await view.click(view.dock()?.querySelector('.unbiseo-dock-fab'))
    assert.equal(view.dock()?.querySelector('.home-assistant-said')?.textContent, '내가 한 말: 어제 수원 화성 15만')
    assert.equal(view.dock()?.querySelector('.home-assistant-result')?.textContent, '10월 21일 수원 → 화성, 150,000원으로 기록할게요.')
  } finally { await view.cleanup() }
})

test('카드에서 [기록하기] → 그 날짜 일지에 채운 입력 창, 다시 작은 버튼', async () => {
  replies = [callReply('수원', '화성')]
  const view = await renderShell('dock-open', '/app/revenue')
  try {
    await view.askDock('어제 수원 화성 15만')
    await view.click(view.button('기록하기', view.dock() || undefined))
    await view.waitForLoad('수원')
    assert.equal(window.location.pathname, `/app/day/${DATE}`)
    assert.equal(view.dock()?.querySelector('.home-assistant-panel'), null, '작게')
    assert.ok(view.dock()?.querySelector('.unbiseo-dock-fab'))
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
    await view.waitForLoad('수원')
    assert.equal(view.value('callLoadLoc'), '수원')

    await view.askDock('어제 평택 용인 15만')
    await view.click(view.button('기록하기', view.dock() || undefined))
    await waitUntil(() => !!view.container.textContent?.includes('저장하지 않은 입력이 있습니다'))
    assert.ok(view.container.textContent?.includes('저장하지 않은 입력이 있습니다'))
    await view.click(view.button('계속 입력'))
    assert.equal(view.value('callLoadLoc'), '수원', '[계속 입력]이면 채우지 않음')

    await view.askDock('어제 평택 용인 15만')
    await view.click(view.button('기록하기', view.dock() || undefined))
    await waitUntil(() => !!view.button('나가기'))
    await view.click(view.button('나가기'))
    await view.waitForLoad('평택')
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
    await view.waitForLoad('평택')
    assert.ok(!view.container.textContent?.includes('저장하지 않은 입력이 있습니다'))
    assert.equal(view.value('callLoadLoc'), '평택')
  } finally { await view.cleanup() }
})

test('받아쓰기 되는 휴대폰: 버튼을 한 번 누르면 카드가 열리며 바로 듣고, 꺾쇠로 작게 하면 듣기를 멈춘다', async () => {
  let last = null
  class FakeRecognizer {
    constructor() { last = this; this.started = false; this.stopped = false }
    start() { this.started = true }
    stop() { this.stopped = true; this.onend?.() }
    abort() {}
  }
  Reflect.set(window, 'webkitSpeechRecognition', FakeRecognizer)
  const view = await renderShell('dock-listen', '/app/revenue')
  try {
    await waitUntil(() => !!view.dock())
    await view.click(view.dock()?.querySelector('.unbiseo-dock-fab'))
    assert.ok(last?.started, '바로 듣기')
    assert.ok(view.dock()?.querySelector('.home-assistant-mic-btn.listening'), '카드 안 마이크가 듣는 중')
    await view.click(view.dock()?.querySelector('.unbiseo-dock-close'))
    assert.ok(last?.stopped, '작게 하면 멈춤')
    assert.ok(view.dock()?.querySelector('.unbiseo-dock-fab'))
  } finally {
    await view.cleanup()
    Reflect.deleteProperty(window, 'webkitSpeechRecognition')
  }
})

// 로드맵 24-C-2 — 지출도 같은 길: [기록하기] → 그 날짜 일지의 지출 창, 이미 열려 있으면 확인 창 먼저.
const expenseReply = (/** @type {'fuel'|'misc'} */ type, /** @type {number} */ cost) => ({ data: { kind: 'expense', expense: { date: DATE, type, cost, name: type === 'misc' ? '통행료' : '', category: type === 'misc' ? '통행료' : '', fuelType: type === 'fuel' ? '주유' : '', payment: '' } } })

test('지출 [기록하기] → 그 날짜 일지의 지출 창, 같은 날짜에서 또 넘기면 확인 창 [나가기] 뒤 새로 채움', async () => {
  replies = [expenseReply('fuel', 120000), expenseReply('misc', 5000)]
  const view = await renderShell('dock-expense', '/app/revenue')
  try {
    await view.askDock('어제 경유 12만원')
    await view.click(view.button('기록하기', view.dock() || undefined))
    await waitUntil(() => view.value('expenseCost') === '120,000')
    assert.equal(window.location.pathname, `/app/day/${DATE}`)
    assert.equal(view.dock()?.querySelector('.home-assistant-panel'), null, '작게')

    await view.askDock('어제 통행료 5천원')
    await view.click(view.button('기록하기', view.dock() || undefined))
    await waitUntil(() => !!view.button('나가기'))
    await view.click(view.button('나가기'))
    await waitUntil(() => view.value('expenseCost') === '5,000')
    assert.equal(view.value('expenseName'), '통행료')
    assert.equal(window.location.pathname, `/app/day/${DATE}`, '일지에 그대로')
  } finally { await view.cleanup() }
})
