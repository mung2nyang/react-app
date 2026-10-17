// 로드맵 82-C — 문자 문구 설정: 빈 칸은 저장 전에 빨간 표시·칸 아래 "문구를 입력해 주세요."·커서.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: MessageSettingsPage } = await import('./MessageSettingsPage.jsx')

/** @param {string} label */
async function click(label) {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent === label)
  assert.ok(button, `${label} 버튼`)
  await act(async () => { button.click() })
}

/** React 제어 입력에 값을 넣고 input 이벤트를 보낸다. @param {HTMLTextAreaElement} input @param {string} value */
async function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set
  await act(async () => { setter?.call(input, value); input.dispatchEvent(new window.Event('input', { bubbles: true })) })
}

test('입금 요청 문자를 비우고 저장 → 그 칸만 표시·문구·커서, 알림 없음, 채우면 사라짐', async () => {
  /** @type {Array<string>} */
  const toasts = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(MessageSettingsPage, { showToast: (/** @type {string} */ m) => { toasts.push(m) } })) })
  try {
    const box = /** @type {HTMLTextAreaElement} */ (container.querySelector('#msgPaymentRequest'))
    await typeInto(box, '  ')
    await click('저장')
    assert.deepEqual(toasts, [])
    assert.equal(box.getAttribute('aria-invalid'), 'true')
    assert.equal(container.querySelector('#msgPaymentRequest-error')?.textContent, '문구를 입력해 주세요.')
    assert.equal(document.activeElement, box)
    assert.equal(container.querySelectorAll('[aria-invalid="true"]').length, 1)
    await typeInto(box, '입금 부탁드립니다.')
    assert.equal(box.getAttribute('aria-invalid'), null)
    await click('저장')
    assert.deepEqual(toasts, ['문자 문구를 저장했습니다.'])
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
