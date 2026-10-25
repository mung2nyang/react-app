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
const { readOwnerExpenses } = await import('../../data/store/ownerDataHooks.ts')
const { readAssistantCall, readAssistantExpense, readAssistantFixed } = await import('./assistantCallState.js')
const { default: MainPageRoute } = await import('./MainPageRoute.jsx')

// 열자마자 "저장하지 않은 입력" 확인 창이 뜨면 안 된다(뒤로가기 붙잡기와 주소 상태 지우기가 겹칠 때).
let confirms = 0
window.confirm = () => { confirms += 1; return true }

const DATE = '2026-10-21'
const CALL = { loadLoc: '수원', unloadLoc: '화성', fare: 150000, client: '한진' }

/** @param {string} ownerKey @param {object|null} usr 주소 상태 @param {{ callDetail?: boolean, workData?: object, settings?: object }} [options] */
async function render(ownerKey, usr, { callDetail = true, workData = {}, settings = {} } = {}) {
  commitSettings(ownerKey, normalizeSettings({ callDetail, ...settings }))
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
    assert.equal(view.title(), '21일 운행일지 세부 내역 입력')
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
    await view.click(view.button('+ 세부 내역 추가'))
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
    await view.click(view.button('+ 세부 내역 추가'))
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

// 로드맵 24-C-2 — 운비서가 넘긴 지출로 그 종류 지출 창을 채워 한 번 연다(저장은 지금 지출 창 그대로).
const FUEL = { type: 'fuel', cost: 120000, name: '경유', category: '', fuelType: '주유', payment: '' }
const MAINT = { type: 'maint', cost: 150000, name: '엔진오일 교환', category: '소모품', fuelType: '', payment: '현금' }
/** @param {HTMLElement} container @param {string} selector */
const activeText = (container, selector) => [...container.querySelectorAll(`.maint-fuel-inline-host ${selector}.active`)].map((el) => el.textContent?.trim())

test('지출로 들어오면 그 종류 지출 창이 채워진 채 열리고, 주소 상태에서는 지워진다(from은 남김)', async () => {
  const view = await render('assist-expense-open', { from: 'home', assistantExpense: FUEL }, { callDetail: false })
  try {
    assert.equal(view.valueOf('expenseCost'), '120,000')
    assert.deepEqual(activeText(view.container, '.pill-btn'), ['주유'], '주유 종류')
    assert.deepEqual(activeText(view.container, '.segment-btn'), ['카드'], '결제는 기본값 그대로')
    assert.equal(view.container.querySelector('#callLoadLoc'), null, '운행 입력 창은 안 엶')
    assert.equal(window.history.state?.usr?.from, 'home')
    assert.equal(window.history.state?.usr?.assistantExpense, undefined)
    assert.equal(window.history.state?.usr?.panelGuard, true, '붙잡기 기록이 맨 위')
    assert.equal(confirms, 0)
  } finally { await view.cleanup() }
})

test('지출 [저장] → 지금 저장 그대로 1건, 다시 "+ 주유 추가"는 빈 창', async () => {
  const view = await render('assist-expense-save', { from: 'home', assistantExpense: FUEL })
  try {
    await view.click(view.button('저장'))
    assert.deepEqual(view.toasts, ['내역을 등록했습니다.'])
    await view.click(view.button('+ 주유 추가'))
    assert.notEqual(view.valueOf('expenseCost'), '120,000')
    await view.click(view.button('취소'))
  } finally { await view.cleanup() }
  const saved = readOwnerExpenses('assist-expense-save')
  assert.equal(saved.length, 1)
  assert.equal(saved[0].kind, 'fuel')
  assert.equal(saved[0].date, DATE)
  assert.equal(saved[0].cost, 120000)
  assert.equal(saved[0].fuelType, '주유')
})

test('지출 [취소] → 아무것도 안 남는다', async () => {
  const view = await render('assist-expense-cancel', { from: 'home', assistantExpense: MAINT })
  try {
    await view.click(view.button('취소'))
    // 닫힘 애니메이션 끝 — 브라우저처럼 지출 창을 내린다.
    const host = view.container.querySelector('.maint-fuel-inline-host')
    assert.ok(host)
    const event = new window.Event('transitionend', { bubbles: true })
    Object.defineProperty(event, 'propertyName', { value: 'grid-template-rows' })
    await act(async () => { host.dispatchEvent(event) })
    assert.equal(view.container.querySelector('#expenseCost'), null)
  } finally { await view.cleanup() }
  assert.equal(readOwnerExpenses('assist-expense-cancel').length, 0)
})

test('정비 지출: 항목명·분류·결제가 채워진다', async () => {
  const view = await render('assist-expense-maint', { from: 'home', assistantExpense: MAINT })
  try {
    assert.equal(view.valueOf('expenseName'), '엔진오일 교환')
    assert.equal(view.valueOf('expenseCost'), '150,000')
    assert.deepEqual(activeText(view.container, '.pill-btn'), ['소모품'])
    assert.deepEqual(activeText(view.container, '.segment-btn'), ['현금'])
  } finally { await view.cleanup() }
})

test('지출 cancelOff: 휴무가 꺼지고 채운 지출 창이 열린다, 닫아도 휴무는 꺼진 채', async () => {
  const view = await render('assist-expense-off', { from: 'home', assistantExpense: { ...FUEL, cancelOff: true } }, { workData: OFF_DAY })
  try {
    assert.equal(view.container.querySelector('.modal-work-details.is-off'), null, '휴무 꺼짐')
    assert.equal(view.valueOf('expenseCost'), '120,000')
    assert.equal(confirms, 0)
    await view.click(view.button('취소'))
  } finally { await view.cleanup() }
  assert.equal(!!readOwnerLogWorkData('assist-expense-off', 'main')[DATE]?.isOff, false, '저장된 기록도 휴무 아님')
})

test('지출 cancelOff 없이 들어오면 휴무는 그대로', async () => {
  const view = await render('assist-expense-keep-off', { from: 'home', assistantExpense: FUEL }, { workData: OFF_DAY })
  try {
    assert.ok(view.container.querySelector('.modal-work-details.is-off'))
  } finally { await view.cleanup() }
  assert.equal(readOwnerLogWorkData('assist-expense-keep-off', 'main')[DATE]?.isOff, true)
})

test('지출 주소 상태가 지워진 뒤 다시 그리면 지출 창이 열리지 않는다', async () => {
  const first = await render('assist-expense-again', { from: 'home', assistantExpense: FUEL })
  const cleared = window.history.state
  await first.cleanup()
  window.history.replaceState(cleared, '', `/app/day/${DATE}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const routes = React.createElement(Routes, null, React.createElement(Route, { path: '/app/day/:date', element: React.createElement(MainPageRoute) }))
  try {
    await act(async () => { root.render(React.createElement(BrowserRouter, null, withSession(routes, { ownerKey: 'assist-expense-again' }))) })
    assert.equal(container.querySelector('#expenseCost'), null)
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('지출 이상한 값은 그 칸만 빈 칸 — 모르는 종류는 정비, 목록 밖 분류·주유 종류·결제, 음수·소수 금액, 100자 넘는 글자', async () => {
  const empty = { type: 'maint', cost: null, name: '', category: '', fuelType: '', payment: '', cancelOff: false }
  assert.deepEqual(readAssistantExpense({ assistantExpense: { type: 'repair', cost: -5, name: '가'.repeat(101), category: '타이어', fuelType: '주유', payment: '신용카드' } }), empty)
  assert.deepEqual(readAssistantExpense({ assistantExpense: { type: 'misc', cost: 5000, name: ' 통행료 ', category: '통행료', payment: '현금', cancelOff: 'true' } }), { ...empty, type: 'misc', cost: 5000, name: '통행료', category: '통행료', payment: '현금' })
  assert.equal(readAssistantExpense({ assistantExpense: { type: 'misc', category: '소모품' } })?.category, '', '기타 목록 밖')
  assert.equal(readAssistantExpense({ assistantExpense: { type: 'fuel', category: '소모품', fuelType: '경유' } })?.category, '', '주유는 분류 없음')
  assert.equal(readAssistantExpense({ assistantExpense: { type: 'fuel', fuelType: '경유' } })?.fuelType, '', '목록 밖 주유 종류')
  assert.equal(readAssistantExpense({ assistantExpense: { type: 'fuel', cost: 1.5 } })?.cost, null)
  assert.equal(readAssistantExpense({ assistantExpense: { ...FUEL, cancelOff: true } })?.cancelOff, true)
  assert.equal(readAssistantExpense({ assistantCall: CALL }), null)
  assert.equal(readAssistantExpense(null), null)
  assert.equal(readAssistantExpense({ assistantExpense: ['주유'] }), null)
  const view = await render('assist-expense-bad', { from: 'home', assistantExpense: { type: 'misc', cost: -5, name: '주차', category: '타이어', payment: 'card' } })
  try {
    assert.equal(view.valueOf('expenseName'), '주차')
    assert.deepEqual(activeText(view.container, '.pill-btn'), ['통행료'], '목록 밖 분류는 기본값')
    assert.deepEqual(activeText(view.container, '.segment-btn'), ['카드'])
  } finally { await view.cleanup() }
})

// 로드맵 24-F-2 — 운비서가 넘긴 고정 노선을 그 날짜 일지에 한 번 더한다(노선 칩·횟수 칸과 같은 동작, 저장은 일지 자동 저장).
const ROUTES = { fixedRouteOn: true, fixedRoutePresets: [{ id: 'r1', loadLoc: '평택', unloadLoc: '용인' }, { id: 'r2', loadLoc: '화성', unloadLoc: '오산' }] }

test('고정 노선이 칩 이름과 같으면 그 칩 횟수와 운행 횟수를 같이 올리고 알림, 주소 상태에서는 지워진다', async () => {
  const view = await render('assist-fixed-route', { from: 'home', assistantFixed: { count: 2, route: '평택 → 용인' } }, { settings: ROUTES, workData: { [DATE]: { fixedCount: 1, fixedRouteCounts: { r2: 1 } } } })
  try {
    assert.deepEqual(view.toasts, ['평택 → 용인 2회를 더했습니다.'])
    assert.deepEqual([...view.container.querySelectorAll('.fixed-route-chip-count')].map((el) => el.textContent), ['2회', '1회'])
    assert.equal(readAssistantFixed(window.history.state?.usr), null)
    assert.equal(window.history.state?.usr?.from, 'home')
    assert.equal(view.container.querySelector('#callLoadLoc'), null, '운행 입력 창은 안 열림')
  } finally { await view.cleanup() }
  const saved = readOwnerLogWorkData('assist-fixed-route', 'main')[DATE]
  assert.equal(saved?.fixedCount, 3)
  assert.deepEqual(saved?.fixedRouteCounts, { r1: 2, r2: 1 })
})

test('노선이 없거나 칩 이름과 다르면 운행 횟수만 올린다', async () => {
  const view = await render('assist-fixed-count', { from: 'home', assistantFixed: { count: 3, route: '' } }, { settings: ROUTES, workData: { [DATE]: { fixedCount: 2 } } })
  try {
    assert.deepEqual(view.toasts, ['고정 노선 3회를 더했습니다.'])
  } finally { await view.cleanup() }
  assert.equal(readOwnerLogWorkData('assist-fixed-count', 'main')[DATE]?.fixedCount, 5)
  assert.ok(!readOwnerLogWorkData('assist-fixed-count', 'main')[DATE]?.fixedRouteCounts?.r1)

  const other = await render('assist-fixed-other', { from: 'home', assistantFixed: { count: 1, route: '평택 → 용인' } }, { settings: { ...ROUTES, fixedRouteOn: false } })
  try {
    assert.deepEqual(other.toasts, ['고정 노선 1회를 더했습니다.'], '노선 칩을 끈 일지')
  } finally { await other.cleanup() }
  assert.equal(readOwnerLogWorkData('assist-fixed-other', 'main')[DATE]?.fixedCount, 1)
})

test('고정 노선 cancelOff: 휴무를 끄고 더한다, cancelOff 없이 휴무면 더하지 않는다', async () => {
  const off = await render('assist-fixed-off', { from: 'home', assistantFixed: { count: 2, route: '화성 → 오산', cancelOff: true } }, { settings: ROUTES, workData: OFF_DAY })
  try {
    assert.equal(off.container.querySelector('.modal-work-details.is-off'), null, '휴무 꺼짐')
  } finally { await off.cleanup() }
  const saved = readOwnerLogWorkData('assist-fixed-off', 'main')[DATE]
  assert.equal(!!saved?.isOff, false)
  assert.equal(saved?.fixedCount, 2)
  assert.deepEqual(saved?.fixedRouteCounts, { r2: 2 })

  const keep = await render('assist-fixed-keep-off', { from: 'home', assistantFixed: { count: 2, route: '' } }, { settings: ROUTES, workData: OFF_DAY })
  try {
    assert.deepEqual(keep.toasts, [])
  } finally { await keep.cleanup() }
  assert.equal(readOwnerLogWorkData('assist-fixed-keep-off', 'main')[DATE]?.isOff, true)
  assert.ok(!readOwnerLogWorkData('assist-fixed-keep-off', 'main')[DATE]?.fixedCount)
})

test('고정 노선 칸이 꺼진 일지면 더하지 않는다', async () => {
  const view = await render('assist-fixed-disabled', { from: 'home', assistantFixed: { count: 2, route: '' } }, { settings: { fixedOn: false } })
  try {
    assert.deepEqual(view.toasts, [])
  } finally { await view.cleanup() }
  assert.ok(!readOwnerLogWorkData('assist-fixed-disabled', 'main')[DATE]?.fixedCount)
})

test('더한 뒤 주소 상태가 지워져 다시 그려도 또 더하지 않는다', async () => {
  const first = await render('assist-fixed-again', { from: 'home', assistantFixed: { count: 2, route: '' } }, { settings: ROUTES })
  const cleared = window.history.state
  await first.cleanup()
  assert.equal(readOwnerLogWorkData('assist-fixed-again', 'main')[DATE]?.fixedCount, 2)
  window.history.replaceState(cleared, '', `/app/day/${DATE}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const routes = React.createElement(Routes, null, React.createElement(Route, { path: '/app/day/:date', element: React.createElement(MainPageRoute) }))
  try {
    await act(async () => { root.render(React.createElement(BrowserRouter, null, withSession(routes, { ownerKey: 'assist-fixed-again' }))) })
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
  assert.equal(readOwnerLogWorkData('assist-fixed-again', 'main')[DATE]?.fixedCount, 2)
})

test('고정 노선 이상한 값: 횟수가 1~20 정수가 아니면 통째로 버림, 100자 넘는 노선은 빈 칸, cancelOff는 참일 때만', () => {
  for (const count of [0, 21, 2.5, '2', null, undefined]) assert.equal(readAssistantFixed({ assistantFixed: { count, route: '' } }), null, String(count))
  assert.deepEqual(readAssistantFixed({ assistantFixed: { count: 20, route: ' 평택 → 용인 ', cancelOff: 'true' } }), { count: 20, route: '평택 → 용인', cancelOff: false })
  assert.deepEqual(readAssistantFixed({ assistantFixed: { count: 1, route: '가'.repeat(101), cancelOff: true } }), { count: 1, route: '', cancelOff: true })
  assert.equal(readAssistantFixed({ assistantFixed: [2] }), null)
  assert.equal(readAssistantFixed({ assistantCall: CALL }), null)
})

// 로드맵 24-G-2 — 운비서 버튼이 갈 곳: 거래처는 거래처 화면, 그 밖은 그 날짜 일지.
test('갈 곳: 거래처는 /app/clients(assistantClient), 운행·고정 노선은 그 날짜 일지', async () => {
  const { assistantNavTarget } = await import('./assistantCallState.js')
  const heard = { name: '한진', manager: '', phone: '', paymentTerm: '', paymentTermValue: null, commType: '', commValue: null }
  assert.deepEqual(assistantNavTarget(heard, { cancelOff: false }), ['/app/clients', { state: { from: 'home', assistantClient: heard } }])
  assert.deepEqual(assistantNavTarget({ date: DATE, ...CALL }, { cancelOff: true }), [`/app/day/${DATE}`, { state: { from: 'home', assistantCall: { ...CALL, cancelOff: true } } }])
  assert.deepEqual(assistantNavTarget({ date: DATE, count: 2, route: '' }, { cancelOff: false }), [`/app/day/${DATE}`, { state: { from: 'home', assistantFixed: { count: 2, route: '', cancelOff: false } } }])
})
