// 로드맵 24-B-2 — 운비서가 주소 상태로 넘긴 운행으로 그날 일지의 새 입력 창을 채워 연다(한 번만, 저장은 지금 그대로).
// 입력 칸의 뒤로가기 붙잡기가 브라우저 기록을 보므로 BrowserRouter로 그린다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { BrowserRouter, Route, Routes } = await import('react-router-dom')
const { withSession } = await import('../../testSupport/withSession.js')
const { withToast } = await import('../../testSupport/withToast.js')
const { normalizeSettings } = await import('../../domain/practiceSettings.ts')
const { commitClients, commitSettings, commitWorkData } = await import('../../data/store/commitHelpers.ts')
const { readOwnerLogWorkData } = await import('../../data/store/ownerDataHooks.ts')
const { readAssistantCall } = await import('./assistantCallState.js')
const { default: MainPageRoute } = await import('./MainPageRoute.jsx')

// 열자마자 "저장하지 않은 입력" 확인 창이 뜨면 안 된다(뒤로가기 붙잡기와 주소 상태 지우기가 겹칠 때).
let confirms = 0
window.confirm = () => { confirms += 1; return true }

const DATE = '2026-10-21'
const CALL = { loadLoc: '수원', unloadLoc: '화성', fare: 150000, client: '한진' }

/** @param {string} ownerKey @param {object|null} usr 주소 상태 @param {{ callDetail?: boolean, workData?: object }} [options] */
async function render(ownerKey, usr, { callDetail = true, workData = {} } = {}) {
  commitSettings(ownerKey, normalizeSettings({ callDetail }))
  commitClients(ownerKey, [{ id: 'c1', companyName: '한진' }])
  commitWorkData(ownerKey, workData)
  window.history.replaceState(usr ? { usr, key: 'k1', idx: 0 } : null, '', `/app/day/${DATE}`)
  const toasts = /** @type {Array<string>} */ ([])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const routes = React.createElement(Routes, null, React.createElement(Route, { path: '/app/day/:date', element: React.createElement(MainPageRoute) }))
  await act(async () => {
    root.render(withToast(React.createElement(BrowserRouter, null, withSession(routes, { ownerKey })), (/** @type {string} */ m) => { toasts.push(m) }))
  })
  /** @param {string} text */
  const button = (text) => [...container.querySelectorAll('button')].find((el) => el.textContent?.trim() === text)
  /** @param {Element|undefined|null} el */
  const click = async (el) => {
    assert.ok(el)
    await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
  }
  /** @param {string} id */
  const valueOf = (id) => /** @type {HTMLInputElement|null} */ (container.querySelector(`#${id}`))?.value
  // 닫힘 애니메이션 끝 — 브라우저처럼 입력 창을 내린다.
  const settle = async () => {
    const host = container.querySelector('.call-detail-inline-host')
    assert.ok(host)
    const event = new window.Event('transitionend', { bubbles: true })
    Object.defineProperty(event, 'propertyName', { value: 'grid-template-rows' })
    await act(async () => { host.dispatchEvent(event) })
  }
  return {
    container, toasts, button, click, valueOf, settle,
    title: () => container.querySelector('.call-detail-modal-title')?.textContent,
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('운비서 운행으로 들어오면 새 입력 창이 채워진 채 열리고, 주소 상태에서는 지워진다(from은 남김)', async () => {
  const view = await render('assist-open', { from: 'home', assistantCall: CALL })
  try {
    assert.equal(view.title(), '21일 일지 세부 입력')
    assert.equal(view.valueOf('callLoadLoc'), '수원')
    assert.equal(view.valueOf('callUnloadLoc'), '화성')
    assert.equal(view.valueOf('callFare'), '150,000')
    assert.equal(view.valueOf('callClient'), '한진')
    assert.equal(window.history.state?.usr?.from, 'home')
    assert.equal(window.history.state?.usr?.assistantCall, undefined)
    assert.equal(window.history.state?.usr?.panelGuard, true, '붙잡기 기록이 맨 위')
    assert.equal(confirms, 0)
  } finally { await view.cleanup() }
})

test('[저장] → 지금 저장 그대로 1건, 다시 "+ 추가"는 빈 입력 창', async () => {
  const view = await render('assist-save', { from: 'home', assistantCall: CALL })
  try {
    await view.click(view.button('저장'))
    assert.deepEqual(view.toasts, ['세부 입력을 저장했습니다.'])
    await view.settle()
    await view.click(view.button('+ 운행일지 추가'))
    assert.equal(view.valueOf('callLoadLoc'), '')
    assert.equal(view.valueOf('callFare'), '')
    await view.click(view.button('취소'))
  } finally { await view.cleanup() }
  // 일지는 닫을 때 남은 편집을 저장한다(useDayDraft).
  const saved = readOwnerLogWorkData('assist-save', 'main')[DATE]?.callDetails || []
  assert.equal(saved.length, 1)
  assert.equal(saved[0].loadLoc, '수원')
  assert.equal(saved[0].unloadLoc, '화성')
  assert.equal(saved[0].client, '한진')
  assert.equal(Number(String(saved[0].fare).replace(/,/g, '')), 150000)
})

test('[취소] → 아무것도 안 남고, 다시 "+ 추가"는 빈 입력 창', async () => {
  const view = await render('assist-cancel', { from: 'home', assistantCall: CALL })
  try {
    await view.click(view.button('취소'))
    await view.settle()
    await view.click(view.button('+ 운행일지 추가'))
    assert.equal(view.valueOf('callLoadLoc'), '')
    assert.equal(view.valueOf('callClient'), '')
    await view.click(view.button('취소'))
  } finally { await view.cleanup() }
  assert.equal((readOwnerLogWorkData('assist-cancel', 'main')[DATE]?.callDetails || []).length, 0)
})

test('주소 상태가 지워진 뒤 다시 그리면 입력 창이 열리지 않는다', async () => {
  const first = await render('assist-again', { from: 'home', assistantCall: CALL })
  const cleared = window.history.state
  await first.cleanup()
  window.history.replaceState(cleared, '', `/app/day/${DATE}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const routes = React.createElement(Routes, null, React.createElement(Route, { path: '/app/day/:date', element: React.createElement(MainPageRoute) }))
  try {
    await act(async () => { root.render(React.createElement(BrowserRouter, null, withSession(routes, { ownerKey: 'assist-again' }))) })
    assert.equal(container.querySelector('#callLoadLoc'), null)
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('"콜 상세"가 꺼진 계정이면 입력 창을 열지 않는다', async () => {
  const view = await render('assist-off', { from: 'home', assistantCall: CALL }, { callDetail: false })
  try {
    assert.equal(view.container.querySelector('#callLoadLoc'), null)
  } finally { await view.cleanup() }
})

test('이상한 값은 그 칸만 빈 칸 — 음수·소수 금액, 100자 넘는 글자, 글자가 아닌 값', async () => {
  assert.deepEqual(
    readAssistantCall({ assistantCall: { loadLoc: '가'.repeat(101), unloadLoc: ' 화성 ', fare: -5, client: 3 } }),
    { loadLoc: '', unloadLoc: '화성', fare: null, client: '', cancelOff: false },
  )
  assert.equal(readAssistantCall({ assistantCall: { ...CALL, fare: 1.5 } })?.fare, null)
  assert.equal(readAssistantCall({ from: 'home' }), null)
  assert.equal(readAssistantCall(null), null)
  assert.equal(readAssistantCall({ assistantCall: ['수원'] }), null)
  const view = await render('assist-bad', { from: 'home', assistantCall: { loadLoc: '가'.repeat(300), unloadLoc: '화성', fare: -5, client: '' } })
  try {
    assert.equal(view.valueOf('callLoadLoc'), '')
    assert.equal(view.valueOf('callUnloadLoc'), '화성')
    assert.equal(view.valueOf('callFare'), '')
  } finally { await view.cleanup() }
})

// 로드맵 24-B-3-A — "휴무 취소하고 기록"이면 휴무를 끄고(휴무 단추와 같은 저장) 채운 입력 창을 연다.
const OFF_DAY = { [DATE]: { isOff: true } }

test('cancelOff: 휴무가 꺼지고 채운 입력 창이 눌리는 상태로 열린다, 닫아도 휴무는 꺼진 채', async () => {
  const view = await render('assist-cancel-off', { from: 'home', assistantCall: { ...CALL, cancelOff: true } }, { workData: OFF_DAY })
  try {
    assert.equal(view.container.querySelector('.modal-work-details.is-off'), null, '휴무 꺼짐')
    assert.equal(view.valueOf('callLoadLoc'), '수원')
    assert.equal(confirms, 0)
    await view.click(view.button('취소'))
  } finally { await view.cleanup() }
  assert.equal(!!readOwnerLogWorkData('assist-cancel-off', 'main')[DATE]?.isOff, false, '저장된 기록도 휴무 아님')
})

test('cancelOff 없이 들어오면 휴무는 그대로(입력 창은 흐린 칸 안)', async () => {
  const view = await render('assist-keep-off', { from: 'home', assistantCall: CALL }, { workData: OFF_DAY })
  try {
    assert.ok(view.container.querySelector('.modal-work-details.is-off'))
  } finally { await view.cleanup() }
  assert.equal(readOwnerLogWorkData('assist-keep-off', 'main')[DATE]?.isOff, true)
})

test('cancelOff는 참일 때만 참 — 글자 "true"·1은 거짓', () => {
  assert.equal(readAssistantCall({ assistantCall: { ...CALL, cancelOff: true } })?.cancelOff, true)
  assert.equal(readAssistantCall({ assistantCall: { ...CALL, cancelOff: 'true' } })?.cancelOff, false)
  assert.equal(readAssistantCall({ assistantCall: { ...CALL, cancelOff: 1 } })?.cancelOff, false)
})

test('휴무를 끈 뒤 주소 상태가 지워져 다시 그려도 휴무를 또 건드리지 않는다', async () => {
  const first = await render('assist-off-again', { from: 'home', assistantCall: { ...CALL, cancelOff: true } }, { workData: OFF_DAY })
  const cleared = window.history.state
  await first.click(first.button('취소'))
  await first.cleanup()
  commitWorkData('assist-off-again', OFF_DAY)
  window.history.replaceState(cleared, '', `/app/day/${DATE}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const routes = React.createElement(Routes, null, React.createElement(Route, { path: '/app/day/:date', element: React.createElement(MainPageRoute) }))
  try {
    await act(async () => { root.render(React.createElement(BrowserRouter, null, withSession(routes, { ownerKey: 'assist-off-again' }))) })
    assert.ok(container.querySelector('.modal-work-details.is-off'), '다시 휴무로 한 날은 그대로')
    assert.equal(container.querySelector('#callLoadLoc'), null)
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
  assert.equal(readOwnerLogWorkData('assist-off-again', 'main')[DATE]?.isOff, true)
})