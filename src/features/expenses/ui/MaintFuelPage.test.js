// 로드맵 97 — 차량 유지비 화면의 보기·저장·수정·삭제 흐름(나누기 전 동작을 그대로 적음).
// 저장 함수는 가짜로 바꿔 끼워 저장소에 넣거나, 실패를 흉내 낸다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

/** @typedef {import('../../../domain/expenseTypes.js').ExpenseItem} ExpenseItem */

const save = { fail: false }
const { commitExpenses } = await import('../../../data/store/commitHelpers.js')
mock.module('../../../data/sync/expensesSave.js', {
  namedExports: {
    saveExpenses: async (/** @type {string} */ ownerKey, /** @type {Array<ExpenseItem>} */ items) => {
      if (save.fail) throw new Error('저장 실패 흉내')
      commitExpenses(ownerKey, items)
    },
  },
})

const React = await import('react')
const { withSession } = await import('../../../testSupport/withSession.js')
const { withToast } = await import('../../../testSupport/withToast.js')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { MemoryRouter } = await import('react-router-dom')
const { default: MaintFuelPage } = await import('./MaintFuelPage.jsx')
const { getState } = await import('../../../data/store/app-store.js')
const { saveFailMessage } = await import('../../../shared/utils/failureMessages.js')

/** 오늘 기준 offset 달의 day일 — 'YYYY-MM-DD' @param {number} offset @param {number} day */
function dateIn(offset, day) {
  const d = new Date()
  const first = new Date(d.getFullYear(), d.getMonth() + offset, 1)
  return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** @param {string} id @param {ExpenseItem['kind']} kind @param {string} date @param {number} cost @param {string} [name] @returns {ExpenseItem} */
function item(id, kind, date, cost, name = '') {
  return { id, kind, date, name: kind === 'fuel' ? '주유' : name, category: kind === 'fuel' ? '주유' : '소모품', fuelType: '주유', payment: '카드', cost, subsidy: 0, mileage: 0, liters: 0 }
}

/** @param {string} ownerKey @param {Array<ExpenseItem>} items */
async function render(ownerKey, items) {
  save.fail = false
  commitExpenses(ownerKey, items)
  const toasts = /** @type {Array<string>} */ ([])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(withToast(React.createElement(MemoryRouter, { initialEntries: ['/app/expenses'] },
      withSession(React.createElement(MaintFuelPage, {}), { ownerKey })), (/** @type {string} */ m) => toasts.push(m)))
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
  const days = () => [...container.querySelectorAll('.management-day-head strong')].map((el) => el.textContent)
  const titles = () => [...container.querySelectorAll('.management-record-title strong')].map((el) => el.textContent)
  const total = () => container.querySelector('.maint-month-summary b')?.textContent
  const stored = () => /** @type {Array<ExpenseItem>} */ (getState().expenses[ownerKey] || [])
  return {
    container, toasts, button, click, type, days, titles, total, stored,
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

const SEED = [
  item('m1', 'maint', dateIn(0, 3), 10000, '엔진오일'),
  item('m2', 'maint', dateIn(0, 12), 25000, '타이어'),
  item('m3', 'maint', dateIn(0, 12), 5000, '와이퍼'),
  item('f1', 'fuel', dateIn(0, 5), 80000),
  item('p1', 'maint', dateIn(-1, 20), 7000, '전구'),
]

test('고른 달·종류의 내역만 날짜별로 나오고 합계가 맞다', async () => {
  const view = await render('mf-view', SEED)
  try {
    assert.deepEqual(view.days(), [dateIn(0, 3), dateIn(0, 12)])
    assert.deepEqual(view.titles().sort(), ['엔진오일', '와이퍼', '타이어'])
    assert.equal(view.total(), '40,000원')
  } finally {
    await view.cleanup()
  }
})

test('이전/다음 달 버튼으로 목록이 바뀐다', async () => {
  const view = await render('mf-month', SEED)
  try {
    await view.click(view.container.querySelector('[title="이전 달"]'))
    assert.deepEqual(view.titles(), ['전구'])
    assert.equal(view.total(), '7,000원')
    await view.click(view.container.querySelector('[title="다음 달"]'))
    await view.click(view.container.querySelector('[title="다음 달"]'))
    assert.deepEqual(view.titles(), [])
    assert.ok(view.container.textContent?.includes('이번 달 등록된 정비 내역이 없습니다.'))
  } finally {
    await view.cleanup()
  }
})

test('종류 탭을 바꾸면 목록·합계가 바뀐다', async () => {
  const view = await render('mf-kind', SEED)
  try {
    await view.click(view.button('주유'))
    assert.deepEqual(view.days(), [dateIn(0, 5)])
    assert.equal(view.total(), '80,000원')
    await view.click(view.button('기타'))
    assert.deepEqual(view.days(), [])
    assert.equal(view.total(), '0원')
  } finally {
    await view.cleanup()
  }
})

test('추가 → 저장하면 저장소에 들어가고 "내역을 등록했습니다."', async () => {
  const view = await render('mf-add', [])
  try {
    await view.click(view.button('+ 추가'))
    await view.type('#expenseName', '브레이크')
    await view.click(view.button('저장'))
    assert.deepEqual(view.stored().map((x) => x.name), ['브레이크'])
    assert.ok(view.toasts.includes('내역을 등록했습니다.'))
    assert.equal(view.button('저장'), undefined, '창이 닫힘')
    assert.deepEqual(view.titles(), ['브레이크'])
  } finally {
    await view.cleanup()
  }
})

test('수정 → "내역을 수정했습니다."', async () => {
  const view = await render('mf-edit', [item('m1', 'maint', dateIn(0, 3), 10000, '엔진오일')])
  try {
    await view.click(view.container.querySelector('[title="수정"]'))
    await view.type('#expenseName', '미션오일')
    await view.click(view.button('저장'))
    assert.deepEqual(view.stored().map((x) => [x.id, x.name]), [['m1', '미션오일']])
    assert.ok(view.toasts.includes('내역을 수정했습니다.'))
    assert.deepEqual(view.titles(), ['미션오일'])
  } finally {
    await view.cleanup()
  }
})

test('삭제 → 빠지고 "내역을 삭제했습니다."', async () => {
  const view = await render('mf-del', [item('m1', 'maint', dateIn(0, 3), 10000, '엔진오일'), item('m2', 'maint', dateIn(0, 4), 2000, '와이퍼')])
  try {
    await view.click(view.container.querySelector('[title="삭제"]'))
    assert.equal(view.stored().length, 1)
    assert.ok(view.toasts.includes('내역을 삭제했습니다.'))
    assert.equal(view.titles().length, 1)
  } finally {
    await view.cleanup()
  }
})

test('저장 실패면 실패 알림이 뜨고 입력 창이 닫히지 않는다', async () => {
  const view = await render('mf-fail', [])
  const quiet = mock.method(console, 'error', () => {})
  try {
    await view.click(view.button('+ 추가'))
    await view.type('#expenseName', '브레이크')
    save.fail = true
    await view.click(view.button('저장'))
    assert.deepEqual(view.toasts, [saveFailMessage(false)])
    assert.ok(view.button('저장'), '창이 열려 있음')
    assert.deepEqual(view.stored(), [])
  } finally {
    quiet.mock.restore()
    await view.cleanup()
  }
})
