// 로드맵 24-K-2 — 운비서가 주소 상태로 넘긴 휴무를 그날 일지에 한 번 적용: 휴무 단추와 같은 확인(콜 있음)·같은 저장(고정 0)·알림.
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
const { commitSettings, commitWorkData } = await import('../../data/store/commitHelpers.ts')
const { readOwnerLogWorkData } = await import('../../data/store/ownerDataHooks.ts')
const { assistantNavTarget, readAssistantDayOff } = await import('./assistantCallState.js')
const { default: MainPageRoute } = await import('./MainPageRoute.jsx')

const DATE = '2026-10-21'
/** @type {Array<string>} */
let asked = []
let answer = true
window.confirm = (/** @type {string|undefined} */ message) => { asked.push(String(message)); return answer }

/** @param {string} ownerKey @param {object|null} usr 주소 상태 @param {object} [workData] */
async function render(ownerKey, usr, workData = {}) {
  asked = []
  commitSettings(ownerKey, normalizeSettings({ fixedOn: true }))
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
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
  return {
    container, toasts,
    isOff: () => !!container.querySelector('.modal-work-details.is-off'),
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

const saved = (/** @type {string} */ ownerKey) => readOwnerLogWorkData(ownerKey, 'main')[DATE]

test('휴무로 하기: 콜 없는 날은 묻지 않고 휴무 켜짐·고정 횟수 0·알림, 주소 상태에서는 지워진다', async () => {
  const view = await render('dayoff-on', { from: 'home', assistantDayOff: { off: true } }, { [DATE]: { fixedCount: 3 } })
  try {
    assert.equal(view.isOff(), true)
    assert.deepEqual(view.toasts, ['10월 21일을 휴무로 바꿨습니다.'])
    assert.deepEqual(asked, [])
    assert.equal(readAssistantDayOff(window.history.state?.usr), null)
    assert.equal(window.history.state?.usr?.from, 'home')
  } finally { await view.cleanup() }
  assert.equal(saved('dayoff-on')?.isOff, true)
  assert.ok(!saved('dayoff-on')?.fixedCount, '고정 횟수 0')
})

test('휴무 취소하기: 휴무가 꺼지고 고정 횟수는 건드리지 않음·알림', async () => {
  const view = await render('dayoff-cancel', { from: 'home', assistantDayOff: { off: false } }, { [DATE]: { isOff: true } })
  try {
    assert.equal(view.isOff(), false)
    assert.deepEqual(view.toasts, ['10월 21일 휴무를 취소했습니다.'])
  } finally { await view.cleanup() }
  assert.equal(!!saved('dayoff-cancel')?.isOff, false)
  assert.ok(!saved('dayoff-cancel')?.fixedCount)
})

test('콜이 있는 날을 휴무로: 휴무 단추와 같은 확인 창 — [취소]면 그대로, 확인하면 휴무', async () => {
  const day = { [DATE]: { callDetails: [{ id: 'c1', fare: 80000 }] } }
  answer = false
  const keep = await render('dayoff-calls-keep', { from: 'home', assistantDayOff: { off: true } }, day)
  try {
    assert.deepEqual(asked, ['휴무로 바꾸시겠습니까?\n이날 콜 1건이 있습니다. 휴무로 바꾸면 이 콜은 합계와 미수에서 빠집니다.'])
    assert.equal(keep.isOff(), false)
    assert.deepEqual(keep.toasts, [])
  } finally { await keep.cleanup() }
  assert.equal(!!saved('dayoff-calls-keep')?.isOff, false)
  answer = true
  const off = await render('dayoff-calls-off', { from: 'home', assistantDayOff: { off: true } }, day)
  try {
    assert.equal(asked.length, 1)
    assert.equal(off.isOff(), true)
    assert.deepEqual(off.toasts, ['10월 21일을 휴무로 바꿨습니다.'])
  } finally { await off.cleanup() }
})

test('이미 그 상태면 아무것도 바꾸지 않고 알림도 없다', async () => {
  const already = await render('dayoff-already', { from: 'home', assistantDayOff: { off: true } }, { [DATE]: { isOff: true } })
  try {
    assert.deepEqual(already.toasts, [])
  } finally { await already.cleanup() }
  const notOff = await render('dayoff-not-off', { from: 'home', assistantDayOff: { off: false } }, { [DATE]: { fixedCount: 1 } })
  try {
    assert.deepEqual(notOff.toasts, [])
    assert.equal(notOff.isOff(), false)
  } finally { await notOff.cleanup() }
  assert.equal(saved('dayoff-not-off')?.fixedCount, 1)
})

test('적용한 뒤 주소 상태가 지워져 다시 그려도 또 바꾸지 않는다', async () => {
  const first = await render('dayoff-again', { from: 'home', assistantDayOff: { off: true } })
  const cleared = window.history.state
  await first.cleanup()
  commitWorkData('dayoff-again', {})
  window.history.replaceState(cleared, '', `/app/day/${DATE}`)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const routes = React.createElement(Routes, null, React.createElement(Route, { path: '/app/day/:date', element: React.createElement(MainPageRoute) }))
  try {
    await act(async () => { root.render(React.createElement(BrowserRouter, null, withSession(routes, { ownerKey: 'dayoff-again' }))) })
    assert.equal(container.querySelector('.modal-work-details.is-off'), null)
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
  assert.equal(!!saved('dayoff-again')?.isOff, false)
})

test('주소 상태 읽기: off가 참·거짓일 때만, 갈 곳은 그 날짜 일지', () => {
  assert.deepEqual(readAssistantDayOff({ assistantDayOff: { off: true } }), { off: true })
  assert.deepEqual(readAssistantDayOff({ assistantDayOff: { off: false, date: 'x' } }), { off: false })
  for (const off of ['true', 1, null, undefined]) assert.equal(readAssistantDayOff({ assistantDayOff: { off } }), null, String(off))
  assert.equal(readAssistantDayOff({ assistantDayOff: [true] }), null)
  assert.equal(readAssistantDayOff(null), null)
  assert.deepEqual(assistantNavTarget({ date: DATE, off: true }, { cancelOff: false }), [`/app/day/${DATE}`, { state: { from: 'home', assistantDayOff: { off: true } } }])
  assert.deepEqual(assistantNavTarget({ date: DATE, off: false }, { cancelOff: true }), [`/app/day/${DATE}`, { state: { from: 'home', assistantDayOff: { off: false } } }])
})
