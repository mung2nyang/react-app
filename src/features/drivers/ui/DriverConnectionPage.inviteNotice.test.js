import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { withSession } = await import('../../../testSupport/withSession.js')
const { createRoot } = await import('react-dom/client')
const { default: DriverConnectionPage } = await import('./DriverConnectionPage.jsx')
const { commitDrivers } = await import('../../../data/store/commitHelpers.ts')
const { beginSessionEpoch, endCloudSession } = await import('../../../data/cloud/cloudSession.ts')

const GUEST_NOTICE = '기사를 초대하려면 로그인한 뒤 배정 차량과 계약 시작일을 입력하세요.'

/** @param {Record<string, import('../../../data/store/atomicPersist.ts').JsonValue|null>} session */
async function renderPage(ownerKey, session) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(async () => {
    root.render(withSession(React.createElement(DriverConnectionPage, { onBack: () => {} }), { ownerKey, session }))
  })
  return { container, root }
}

/** @param {HTMLElement} container @param {string} label */
function clickButton(container, label) {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent === label)
  assert.ok(button, `${label} 버튼이 있어야 한다`)
  return React.act(async () => { button.click() })
}

/** @param {HTMLElement} container @param {string} htmlFor */
function labelText(container, htmlFor) {
  return container.querySelector(`label[for="${htmlFor}"]`)?.textContent
}

test('71-5: 로그인 회원 초대 창은 배정 차량·계약 시작일에 (필수), 비회원 안내는 안 보임', async () => {
  const ownerKey = 'invite-notice-member'
  beginSessionEpoch(ownerKey, ownerKey)
  commitDrivers(ownerKey, [])
  const { container, root } = await renderPage(ownerKey, { userId: ownerKey, name: '차주', phone: '' })
  try {
    assert.equal(container.textContent?.includes(GUEST_NOTICE), false)
    await clickButton(container, '+ 초대')
    assert.equal(labelText(container, 'drvCar'), '배정 차량 (필수)')
    assert.equal(labelText(container, 'drvStart'), '계약 시작일 (필수)')
  } finally {
    await React.act(async () => { root.unmount() })
    container.remove()
    endCloudSession()
    localStorage.clear()
  }
})

test('71-6: 비회원은 기사 연결 현황 아래 로그인 안내가 보이고, 옛 초대를 고칠 때 (필수)는 없음', async () => {
  const ownerKey = 'invite-notice-guest'
  commitDrivers(ownerKey, [{ id: 'old-invite', name: '옛기사', status: 'pending', inviteCode: '123456' }])
  const { container, root } = await renderPage(ownerKey, null)
  try {
    assert.ok(container.textContent?.includes(GUEST_NOTICE))
    await clickButton(container, '초대 수정')
    assert.equal(labelText(container, 'drvCar'), '배정 차량')
    assert.equal(labelText(container, 'drvStart'), '계약 시작일')
  } finally {
    await React.act(async () => { root.unmount() })
    container.remove()
    localStorage.clear()
  }
})
