// 로드맵 99-A — 운행일지 화면의 콜 상세·수금·고정 노선·고정 장소 처리 흐름(훅으로 옮기기 전 동작을 그대로 적음).
// 고정 장소 저장만 가짜로 바꿔 끼워 실패를 흉내 낸다. 수정·수금·삭제는 미리 넣은 콜로 시작한다.
// 입력 칸의 뒤로가기 붙잡기가 브라우저 기록을 보므로 MemoryRouter가 아니라 BrowserRouter로 그린다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const pinSave = { calls: 0 }
mock.module('../../../data/sync/settingsSave.ts', {
  namedExports: {
    savePracticeSettings: async () => { pinSave.calls += 1; throw new Error('저장 실패 흉내') },
    applyTheme: () => {},
  },
})

const React = await import('react')
const { withSession } = await import('../../../testSupport/withSession.js')
const { withToast } = await import('../../../testSupport/withToast.js')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { BrowserRouter } = await import('react-router-dom')
const { normalizeSettings } = await import('../../../domain/practiceSettings.ts')
const { commitWorkData } = await import('../../../data/store/commitHelpers.ts')
const { default: DayLogPage } = await import('./DayLogPage.jsx')

const DATE = '2026-10-17'
const SETTINGS = normalizeSettings({
  callDetail: true, paymentOn: true, fixedOn: true, fixedRouteOn: true,
  fixedRoutePresets: [{ id: 'r1', loadLoc: '인천', unloadLoc: '평택' }],
})
const SEED_CALL = { id: 'call-1', loadLoc: '부산', unloadLoc: '대구', client: '', fare: '50000' }

/** @param {string} ownerKey @param {Array<typeof SEED_CALL>} calls @param {Array<object>} [clients] */
async function render(ownerKey, calls, clients = []) {
  commitWorkData(ownerKey, calls.length ? { [DATE]: { callDetails: calls } } : {})
  window.history.replaceState(null, '', `/app/day/${DATE}`)
  const toasts = /** @type {Array<string>} */ ([])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(withToast(React.createElement(BrowserRouter, null, withSession(React.createElement(DayLogPage, {
      month: 10, day: 17, dateKey: DATE, clients, settings: SETTINGS,
    }), { ownerKey })), (/** @type {string} */ m) => { toasts.push(m) }))
  })
  /** @param {string} text */
  const button = (text) => [...container.querySelectorAll('button')].find((el) => el.textContent?.trim() === text)
  /** @param {Element|undefined|null} el */
  const click = async (el) => {
    assert.ok(el)
    await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
  }
  /** @param {string} selector @param {string} value */
  const type = async (selector, value) => {
    const el = /** @type {HTMLInputElement|null} */ (container.querySelector(selector))
    assert.ok(el, selector)
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    await act(async () => { setter?.call(el, value); el.dispatchEvent(new window.Event('input', { bubbles: true })) })
  }
  const cards = () => container.querySelectorAll('.call-detail-card-foot').length
  const text = () => container.textContent || ''
  return {
    container, toasts, button, click, type, cards, text,
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('콜 상세 새로 저장 → 카드 1개, "세부 입력을 저장했습니다."', async () => {
  const view = await render('daylog-call-add', [])
  try {
    await view.click(view.button('+ 운행일지 추가'))
    await view.type('#callLoadLoc', '광주')
    await view.type('#callFare', '30000')
    await view.click(view.button('저장'))
    assert.equal(view.cards(), 1)
    assert.deepEqual(view.toasts, ['세부 입력을 저장했습니다.'])
    assert.ok(view.text().includes('광주'))
  } finally {
    await view.cleanup()
  }
})

test('미리 넣은 콜 수정 → "세부 입력을 수정했습니다."', async () => {
  const view = await render('daylog-call-edit', [SEED_CALL])
  try {
    await view.click(view.container.querySelector('[title="수정"]'))
    await view.type('#callLoadLoc', '울산')
    await view.click(view.button('저장'))
    assert.equal(view.cards(), 1)
    assert.deepEqual(view.toasts, ['세부 입력을 수정했습니다.'])
    assert.ok(view.text().includes('울산'))
  } finally {
    await view.cleanup()
  }
})

test('수금 단추 → "수금 처리했습니다.", 다시 → "수금을 취소했습니다."', async () => {
  const view = await render('daylog-call-pay', [SEED_CALL])
  try {
    await view.click(view.container.querySelector('.payment-toggle-btn'))
    assert.equal(view.container.querySelector('.payment-toggle-btn')?.textContent, '수금')
    await view.click(view.container.querySelector('.payment-toggle-btn'))
    assert.equal(view.container.querySelector('.payment-toggle-btn')?.textContent, '미수')
    assert.deepEqual(view.toasts, ['수금 처리했습니다.', '수금을 취소했습니다.'])
  } finally {
    await view.cleanup()
  }
})

test('콜 삭제 → 카드 0개', async () => {
  const view = await render('daylog-call-del', [SEED_CALL])
  try {
    assert.equal(view.cards(), 1)
    await view.click(view.container.querySelector('[title="삭제"]'))
    assert.equal(view.cards(), 0)
  } finally {
    await view.cleanup()
  }
})

test('고정 노선 칩 +1 → 칩 횟수와 고정 횟수가 같이 1 오름', async () => {
  const view = await render('daylog-route-run', [])
  try {
    await view.click(view.container.querySelector('.fixed-route-chip-select'))
    assert.equal(view.container.querySelector('.fixed-route-chip-count')?.textContent, '1회')
    assert.equal(/** @type {HTMLInputElement|null} */ (view.container.querySelector('#modalFixedCountInput'))?.value, '1')
  } finally {
    await view.cleanup()
  }
})

test('고정 장소 저장이 실패하면 "고정 장소 저장에 실패했습니다."', async () => {
  const view = await render('daylog-pin-fail', [SEED_CALL])
  const before = pinSave.calls
  try {
    await view.click(view.container.querySelector('[title="수정"]'))
    await view.click(view.container.querySelector('[aria-label="부산 장소 고정"]'))
    assert.equal(pinSave.calls - before, 1)
    assert.deepEqual(view.toasts, ['고정 장소 저장에 실패했습니다.'])
  } finally {
    await view.cleanup()
  }
})

// 로드맵 109-B — 제목 아래 운송료 합계는 저장을 기다리지 않고 입력하는 즉시 바뀐다.
test('횟수를 바꾸면 제목 아래 운송료 합계가 바로 바뀐다', async () => {
  const clients = [{ id: 'cl', companyName: '고정거래처', fixedRouteLinked: true, fixedUnitPrice: 50000 }]
  const view = await render('daylog-fare-total', [SEED_CALL], clients)
  const line = () => view.container.querySelector('.day-fare-total')?.textContent
  try {
    assert.equal(line(), '운송료 합계 50,000원')
    const stack = view.container.querySelector('.modal-title-stack')
    assert.ok(stack?.querySelector('.day-fare-total'), '합계는 제목 묶음 안(제목 아래 여백에 뜸)')
    assert.ok(stack?.querySelector('.autosave-status'), '저장 아이콘과 같은 묶음')
    await view.type('#modalFixedCountInput', '3')
    assert.equal(line(), '운송료 합계 200,000원')
  } finally {
    await view.cleanup()
  }
})
