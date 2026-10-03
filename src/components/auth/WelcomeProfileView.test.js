// 구글 로그인 G-2 — 구글 첫 로그인 기본 정보 화면: 구글 이름 미리 채움, 이름+전화번호 10자리 이상이어야 [시작하기], 실패하면 다시 누를 수 있음.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: WelcomeProfileView } = await import('./WelcomeProfileView.jsx')

/**
 * @param {string} initialName
 * @param {(fields: { name: string, phone: string }) => Promise<boolean>} onSubmit
 */
async function render(initialName, onSubmit) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(WelcomeProfileView, { initialName, onSubmit })) })
  const nameInput = /** @type {HTMLInputElement} */ (container.querySelector('#welcomeName'))
  const phoneInput = /** @type {HTMLInputElement} */ (container.querySelector('#welcomePhone'))
  const button = /** @type {HTMLButtonElement} */ ([...container.querySelectorAll('button')].find((b) => b.textContent === '시작하기'))
  return { nameInput, phoneInput, button, async cleanup() { await act(async () => { root.unmount() }); container.remove() } }
}

/**
 * React가 값 변경을 알아채도록 원래 setter로 넣고 input 이벤트를 보낸다.
 * @param {HTMLInputElement} input
 * @param {string} value
 */
async function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

test('구글 이름이 미리 채워지고, 전화번호 10자리 전엔 [시작하기]가 잠겨 있다', async () => {
  const view = await render('홍길동', async () => true)
  try {
    assert.equal(view.nameInput.value, '홍길동')
    assert.equal(view.button.disabled, true)
    await typeInto(view.phoneInput, '010123')
    assert.equal(view.button.disabled, true)
    await typeInto(view.phoneInput, '01012345678')
    assert.equal(view.phoneInput.value, '010-1234-5678')
    assert.equal(view.button.disabled, false)
  } finally { await view.cleanup() }
})

test('[시작하기]는 다듬은 이름·전화번호로 한 번 보내고, 성공하면 잠긴 채로 둔다', async () => {
  /** @type {Array<{ name: string, phone: string }>} */
  const sent = []
  const view = await render('', async (fields) => { sent.push(fields); return true })
  try {
    await typeInto(view.nameInput, '  김기사 ')
    await typeInto(view.phoneInput, '01098765432')
    await act(async () => { view.button.click() })
    assert.deepEqual(sent, [{ name: '김기사', phone: '010-9876-5432' }])
    assert.equal(view.button.disabled, true)
  } finally { await view.cleanup() }
})

test('저장이 실패하면 버튼을 다시 누를 수 있다', async () => {
  let calls = 0
  const view = await render('홍길동', async () => { calls += 1; return false })
  try {
    await typeInto(view.phoneInput, '01012345678')
    await act(async () => { view.button.click() })
    assert.equal(calls, 1)
    assert.equal(view.button.disabled, false)
  } finally { await view.cleanup() }
})
