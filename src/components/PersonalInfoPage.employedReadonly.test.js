// 로드맵 9-B-0 — 연동 기사 개인정보: 사업자 정보·정산 계좌는 차주가 입력한 값 보기만(잠금), 대표자·연락처는 기사 본인(입력 가능). 차주는 전부 입력 가능.
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

const OWNER_FIELDS = ['bizName', 'bizRepresentative', 'bizNumber', 'bizAddress', 'bizType', 'bizItem', 'bizEmail', 'bankName', 'accountNumber', 'accountHolder']
const SELF_FIELDS = ['userName', 'userPhone']

/** @param {import('../lib/outboxTypes.js').AppSession} session */
async function render(session) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(PersonalInfoPage, { ownerKey: 'owner-9b0', session }))
  })
  /** @param {string} id */
  const disabled = (id) => {
    const el = container.querySelector(`#${id}`)
    assert.ok(el instanceof window.HTMLInputElement, `${id} 칸이 있어야 한다`)
    return el.disabled
  }
  const text = container.textContent || ''
  return { disabled, text, cleanup: async () => { await act(async () => { root.unmount() }); container.remove() } }
}

test('연동 기사: 사업자 정보 7칸·정산 계좌 3칸은 잠기고 안내 문구, 대표자·연락처는 입력 가능', async () => {
  const view = await render({ userId: 'driver-9b0', name: '기사', phone: '', accountType: 'employed_driver', linkedOwnerId: 'owner-9b0', guestMode: false })
  try {
    for (const id of OWNER_FIELDS) assert.equal(view.disabled(id), true, `${id}는 잠겨야 한다`)
    for (const id of SELF_FIELDS) assert.equal(view.disabled(id), false, `${id}는 기사가 고칠 수 있어야 한다`)
    assert.equal(view.text.split('차주가 입력한 정보입니다 (수정 불가)').length - 1, 1, '정산 계좌를 포함한 사업자 정보 카드에 안내 1번')
  } finally {
    await view.cleanup()
  }
})

test('차주: 모든 칸 입력 가능, 안내 문구 없음', async () => {
  const view = await render({ userId: 'owner-9b0', name: '차주', phone: '', accountType: 'owner_driver', linkedOwnerId: null, guestMode: false })
  try {
    for (const id of [...OWNER_FIELDS, ...SELF_FIELDS]) assert.equal(view.disabled(id), false, `${id}`)
    assert.equal(view.text.includes('차주가 입력한 정보입니다'), false)
  } finally {
    await view.cleanup()
  }
})
