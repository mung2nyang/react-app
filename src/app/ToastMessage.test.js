// 로드맵 83 — 실패 알림은 빨간 바탕·느낌표·바로 읽어 줌, 그 밖은 지금처럼. 문장마다 새 줄.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: ToastMessage } = await import('./ToastMessage.jsx')
const { SERVER_SAVE_FAIL } = await import('../lib/failureMessages.js')

/** @param {string} message @param {(container: HTMLElement) => void} check */
async function withToast(message, check) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(ToastMessage, { message })) })
  try {
    check(container)
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
}

test('실패 문구 → 빨간 알림(is-error)·느낌표·바로 읽어 줌(role="alert")', async () => {
  await withToast(SERVER_SAVE_FAIL, (container) => {
    const toast = container.querySelector('.toast-message')
    assert.ok(toast?.classList.contains('is-error'))
    assert.equal(toast?.getAttribute('role'), 'alert')
    assert.ok(toast?.querySelector('svg'))
  })
})

test('그 밖의 문구 → 지금처럼 role="status", 빨강·느낌표 없음', async () => {
  await withToast('내역을 등록했습니다.', (container) => {
    const toast = container.querySelector('.toast-message')
    assert.equal(toast?.classList.contains('is-error'), false)
    assert.equal(toast?.getAttribute('role'), 'status')
    assert.equal(toast?.querySelector('svg'), null)
  })
})

test('두 문장이면 줄 2개, 알림 전체 글자는 원래 문구와 같다(띄어쓰기 없는 점은 안 나눔)', async () => {
  await withToast(SERVER_SAVE_FAIL, (container) => {
    const toast = container.querySelector('.toast-message')
    const lines = [...(toast?.querySelectorAll('.toast-line') ?? [])].map((line) => line.textContent?.trim())
    assert.deepEqual(lines, ['저장에 실패했습니다.', '네트워크 상태를 확인해 주세요.'])
    assert.equal(toast?.textContent, SERVER_SAVE_FAIL)
  })
  await withToast('3.3% 원천징수를 뗐습니다.', (container) => {
    assert.equal(container.querySelectorAll('.toast-line').length, 1)
  })
})

test('문구가 없으면 아무것도 그리지 않는다', async () => {
  await withToast('', (container) => {
    assert.equal(container.querySelector('.toast-message'), null)
  })
})
