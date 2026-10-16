// 로드맵 57-A — 공용 창 껍데기: 바깥 누름·Esc 닫기(끌 수 있음), 겹친 창은 맨 위만 Esc, 열고 닫을 때 키보드 위치.
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
const { default: ModalShell } = await import('./ModalShell.jsx')

/** @param {(close: (name: string) => void) => import('react').ReactNode} build */
async function mount(build) {
  /** @type {Array<string>} */
  const closed = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(build((name) => { closed.push(name) })) })
  return {
    container,
    closed,
    async cleanup() {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

function pressEscape() {
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

test('바깥(회색) 누르면 닫히고, 안쪽 누르면 안 닫힌다 — 창 표시·안쪽 CSS 이름 그대로', async () => {
  const view = await mount((close) => React.createElement(ModalShell, { onClose: () => close('a'), contentClassName: 'modal-content extra', label: '시험 창' },
    React.createElement('button', { type: 'button', className: 'inside' }, '안')))
  try {
    const box = view.container.querySelector('.modal-content.extra')
    assert.ok(box)
    assert.equal(box.getAttribute('role'), 'dialog')
    assert.equal(box.getAttribute('aria-modal'), 'true')
    assert.equal(box.getAttribute('aria-label'), '시험 창')
    await act(async () => { /** @type {HTMLElement} */ (view.container.querySelector('.inside')).click() })
    assert.deepEqual(view.closed, [])
    await act(async () => { /** @type {HTMLElement} */ (view.container.querySelector('.modal-overlay')).click() })
    assert.deepEqual(view.closed, ['a'])
  } finally { await view.cleanup() }
})

test('Esc로 닫히고, 끄면(closeOnOverlay·closeOnEscape false) 둘 다 안 닫힌다', async () => {
  const on = await mount((close) => React.createElement(ModalShell, { onClose: () => close('on') }, 'x'))
  try {
    await act(async () => { pressEscape() })
    assert.deepEqual(on.closed, ['on'])
  } finally { await on.cleanup() }
  const off = await mount((close) => React.createElement(ModalShell, { onClose: () => close('off'), closeOnOverlay: false, closeOnEscape: false }, 'x'))
  try {
    await act(async () => { pressEscape() })
    await act(async () => { /** @type {HTMLElement} */ (off.container.querySelector('.modal-overlay')).click() })
    assert.deepEqual(off.closed, [])
  } finally { await off.cleanup() }
})

test('창이 겹치면 Esc는 맨 위 창만 닫는다', async () => {
  const view = await mount((close) => React.createElement(React.Fragment, null,
    React.createElement(ModalShell, { onClose: () => close('bottom') }, 'b'),
    React.createElement(ModalShell, { onClose: () => close('top') }, 't')))
  try {
    await act(async () => { pressEscape() })
    assert.deepEqual(view.closed, ['top'])
  } finally { await view.cleanup() }
})

test('열리면 키보드 위치가 창 안으로(지정한 칸 또는 창), 닫히면 원래 자리로', async () => {
  const opener = document.createElement('button')
  document.body.appendChild(opener)
  opener.focus()
  const target = React.createRef()
  const view = await mount(() => React.createElement(ModalShell, { onClose: () => {}, initialFocusRef: target },
    React.createElement('button', { type: 'button', ref: target, className: 'first' }, '취소')))
  try {
    assert.equal(document.activeElement, view.container.querySelector('.first'))
  } finally { await view.cleanup() }
  assert.equal(document.activeElement, opener)
  const plain = await mount(() => React.createElement(ModalShell, { onClose: () => {} }, 'x'))
  try {
    assert.equal(document.activeElement, plain.container.querySelector('.modal-content'))
  } finally { await plain.cleanup() }
  opener.remove()
})
