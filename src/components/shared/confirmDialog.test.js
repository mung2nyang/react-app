// 앱 공용 확인 창 — 기본 확인 창 대신 앱 확인 창(ConfirmModal)으로 묻고, 누른 버튼대로 답한다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { ConfirmDialogHost, confirmDialog } = await import('./confirmDialog.jsx')

async function mountHost() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(ConfirmDialogHost)) })
  return { container, cleanup: async () => { await act(async () => { root.unmount() }); container.remove() } }
}

/** @param {HTMLElement} container @param {string} label */
function button(container, label) {
  const found = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent === label)
  assert.ok(found, `[${label}] 버튼이 있다`)
  return found
}

test('제목·본문·버튼 이름을 앱 확인 창으로 보이고, [나가기]면 true', async () => {
  const { container, cleanup } = await mountHost()
  try {
    /** @type {Promise<boolean>|null} */
    let answer = null
    await act(async () => {
      answer = confirmDialog({ title: '저장하지 않은 입력이 있습니다', message: '지금 나가면 입력한 내용이 사라집니다.', confirmLabel: '나가기', cancelLabel: '계속 입력', danger: true })
    })
    assert.equal(container.querySelector('[role="alertdialog"] .modal-title')?.textContent, '저장하지 않은 입력이 있습니다')
    assert.equal(container.querySelector('.confirm-modal-text')?.textContent, '지금 나가면 입력한 내용이 사라집니다.')
    assert.ok(button(container, '나가기').className.includes('danger'))
    await act(async () => { button(container, '나가기').click() })
    assert.equal(await answer, true)
    assert.equal(container.querySelector('[role="alertdialog"]'), null, '누르면 닫힌다')
  } finally {
    await cleanup()
  }
})

test('[계속 입력](취소)이면 false', async () => {
  const { container, cleanup } = await mountHost()
  try {
    /** @type {Promise<boolean>|null} */
    let answer = null
    await act(async () => { answer = confirmDialog({ title: '질문', cancelLabel: '계속 입력', confirmLabel: '나가기' }) })
    await act(async () => { button(container, '계속 입력').click() })
    assert.equal(await answer, false)
  } finally {
    await cleanup()
  }
})

test('앞 질문이 열려 있는데 새 질문이 오면 앞 질문은 false로 끝난다', async () => {
  const { container, cleanup } = await mountHost()
  try {
    /** @type {Promise<boolean>|null} */
    let first = null
    /** @type {Promise<boolean>|null} */
    let second = null
    await act(async () => { first = confirmDialog({ title: '첫 질문' }) })
    await act(async () => { second = confirmDialog({ title: '둘째 질문', confirmLabel: '예' }) })
    assert.equal(await first, false)
    assert.equal(container.querySelector('.modal-title')?.textContent, '둘째 질문')
    await act(async () => { button(container, '예').click() })
    assert.equal(await second, true)
  } finally {
    await cleanup()
  }
})
