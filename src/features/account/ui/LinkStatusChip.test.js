// 로드맵 85 — 연동 기사 마이페이지 개인정보 카드의 "연동중" 칩과 연동 정보 창.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: MyPage } = await import('./MyPage.jsx')
const { replaceOwnerState } = await import('../../../data/store/owner-state.js')

const OWNER = 'cloud:driver-85'
const LINK = { id: 'link-1', name: '홍길동', phone: '010-1111-2222', inviteCode: '123456', status: 'linked', vehicleNumber: '12가3456', startDate: '2026-10-01', endDate: '' }

/** @param {{ accountType: string, drivers: Array<object> }} setup */
async function mount({ accountType, drivers }) {
  replaceOwnerState(OWNER, {
    drivers: /** @type {Array<import('../../../data/sync/syncTypes.js').DriverRecord>} */ (drivers),
    profile: { name: '홍길동', phone: '', bizName: '차주로지스' },
  }, { persist: false })
  /** @type {Array<string>} */
  const opened = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const session = /** @type {import('../../../data/sync/syncTypes.js').AppSession} */ ({ userId: 'driver-85', accountType, name: '홍길동' })
  await act(async () => {
    root.render(React.createElement(MyPage, { session, ownerKey: OWNER, onOpen: (/** @type {string} */ page) => { opened.push(page) } }))
  })
  return {
    container,
    opened,
    chip: () => container.querySelector('.mypage-link-chip'),
    dialog: () => document.querySelector('[role="dialog"]'),
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

/** @param {Element|null|undefined} el */
async function click(el) {
  assert.ok(el instanceof window.HTMLElement)
  await act(async () => { el.click() })
}

/** @param {string} label */
function button(label) {
  return [...document.querySelectorAll('button')].find((item) => item.textContent === label)
}

test('연동 기사 → 칩, 누르면 운송사·배정 차량·계약기간 창(카드는 안 눌림), 개인정보로 가기', async () => {
  const view = await mount({ accountType: 'employed_driver', drivers: [LINK] })
  try {
    assert.equal(view.chip()?.textContent, '연동중')
    assert.equal(view.chip()?.getAttribute('aria-label'), '연동중, 연동 정보 보기')
    await click(view.chip())
    assert.deepEqual(view.opened, [])
    const text = view.dialog()?.textContent || ''
    for (const part of ['연동 중', '운송사', '차주로지스', '배정 차량', '12가3456', '계약기간', '2026-10-01 ~ 종료일 없음', '연동 해제는 개인정보 → 소속 연결에서 할 수 있습니다.']) {
      assert.ok(text.includes(part), part)
    }
    await click(button('개인정보로 가기'))
    assert.deepEqual(view.opened, ['profile'])
    assert.equal(view.dialog(), null)
  } finally { await view.cleanup() }
})

test('닫기는 창만 닫음, 끝나는 날이 있으면 그대로 보임', async () => {
  const view = await mount({ accountType: 'employed_driver', drivers: [{ ...LINK, endDate: '2026-12-31' }] })
  try {
    await click(view.chip())
    assert.ok((view.dialog()?.textContent || '').includes('2026-10-01 ~ 2026-12-31'))
    await click(button('닫기'))
    assert.equal(view.dialog(), null)
    assert.deepEqual(view.opened, [])
  } finally { await view.cleanup() }
})

test('차주 계정·연동 기록 없는 기사 → 칩 없음, 카드는 지금처럼 개인정보', async () => {
  const owner = await mount({ accountType: 'owner', drivers: [LINK] })
  try {
    assert.equal(owner.chip(), null)
    await click(owner.container.querySelector('.mypage-profile-card'))
    assert.deepEqual(owner.opened, ['profile'])
  } finally { await owner.cleanup() }
  const waiting = await mount({ accountType: 'employed_driver', drivers: [] })
  try {
    assert.equal(waiting.chip(), null)
  } finally { await waiting.cleanup() }
})
