// 로드맵 7-A — 연동 중(차주: linked 기사 있음, 기사: employed_driver)이면 탈퇴 확인 창 대신 안내만 뜬다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: PersonalInfoPage } = await import('./PersonalInfoPage.jsx')
const { commitDrivers } = await import('../store/commitHelpers.js')

const LINKED_MSG = '연동을 먼저 해제해야 탈퇴할 수 있습니다.'
const CONFIRM_MSG = '정말 탈퇴하시겠습니까?'

/**
 * @param {string} ownerKey
 * @param {import('../lib/outboxTypes.js').AppSession} session
 */
async function clickWithdraw(ownerKey, session) {
  /** @type {Array<string>} */
  const toasts = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(PersonalInfoPage, { ownerKey, session, showToast: (/** @type {string} */ m) => { toasts.push(m) } }))
  })
  const button = [...container.querySelectorAll('button')].find((el) => el.textContent?.trim() === '회원 탈퇴')
  assert.ok(button instanceof window.HTMLButtonElement, '회원 탈퇴 버튼이 있어야 한다')
  await act(async () => { button.click() })
  const text = document.body.textContent || ''
  await act(async () => { root.unmount() })
  container.remove()
  return { toasts, confirmShown: text.includes(CONFIRM_MSG) }
}

test('차주에게 연동 중인 기사가 있으면 확인 창 없이 안내만 뜬다', async () => {
  const ownerKey = 'owner-7a-linked'
  commitDrivers(ownerKey, [{ id: 'd1', status: 'linked', vehicleNumber: '11가1111' }], { syncToCloud: false })
  const result = await clickWithdraw(ownerKey, { name: '차주', phone: '010-1111-2222', accountType: 'owner_driver' })
  assert.deepEqual(result.toasts, [LINKED_MSG])
  assert.equal(result.confirmShown, false)
})

test('연동된 기사 계정은 확인 창 없이 안내만 뜬다', async () => {
  const ownerKey = 'owner-of-7a-driver'
  commitDrivers(ownerKey, [], { syncToCloud: false })
  const result = await clickWithdraw(ownerKey, { name: '기사', phone: '010-3333-4444', accountType: 'employed_driver', linkedOwnerId: ownerKey })
  assert.deepEqual(result.toasts, [LINKED_MSG])
  assert.equal(result.confirmShown, false)
})

test('초대만 있고 연동이 없으면 지금처럼 확인 창이 뜬다', async () => {
  const ownerKey = 'owner-7a-pending'
  commitDrivers(ownerKey, [{ id: 'd2', status: 'pending', vehicleNumber: '22가2222' }], { syncToCloud: false })
  const result = await clickWithdraw(ownerKey, { name: '차주', phone: '010-5555-6666', accountType: 'owner_driver' })
  assert.deepEqual(result.toasts, [])
  assert.equal(result.confirmShown, true)
})
