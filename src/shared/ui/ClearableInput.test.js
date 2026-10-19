// @ts-check
// 입력칸 X — 입력 중이고 글자가 있을 때만 보이고, 누르면 그 칸의 입력 처리를 빈 글자로 거쳐 비운다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act, useState } = React
const { default: ClearableInput } = await import('./ClearableInput.jsx')
const { formatPhoneNumber } = await import('../../domain/formatPhone.js')

/** @param {{ initial: string, format?: (value: string) => string, seen: Array<string> }} props */
function Harness({ initial, format, seen }) {
  const [value, setValue] = useState(initial)
  return React.createElement(ClearableInput, {
    className: 'input-box',
    value,
    onChange: (e) => {
      seen.push(e.target.value)
      setValue(format ? format(e.target.value) : e.target.value)
    },
  })
}

/** @param {string} initial @param {(value: string) => string} [format] */
async function mount(initial, format) {
  /** @type {Array<string>} */
  const seen = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(Harness, { initial, format, seen })) })
  const input = container.querySelector('input')
  assert.ok(input)
  return {
    container,
    input,
    seen,
    cleanup: async () => {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

/** @param {HTMLElement} container */
const clearButton = (container) => container.querySelector('button[aria-label="입력 지우기"]')

test('입력 중이 아니면 X가 없고, 입력 중이고 글자가 있으면 X가 보인다', async () => {
  const { container, input, cleanup } = await mount('테스트거래처')
  try {
    assert.equal(clearButton(container), null)
    await act(async () => { input.focus() })
    assert.ok(clearButton(container))
    await act(async () => { input.blur() })
    assert.equal(clearButton(container), null)
  } finally { await cleanup() }
})

test('빈 칸이면 입력 중이어도 X가 없다', async () => {
  const { container, input, cleanup } = await mount('')
  try {
    await act(async () => { input.focus() })
    assert.equal(clearButton(container), null)
  } finally { await cleanup() }
})

test('X를 누르면 입력 처리가 빈 글자로 불리고 칸이 비며, 입력 상태는 유지된다', async () => {
  const { container, input, seen, cleanup } = await mount('테스트거래처')
  try {
    await act(async () => { input.focus() })
    const button = clearButton(container)
    assert.ok(button)
    await act(async () => { button.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    assert.deepEqual(seen, [''])
    assert.equal(input.value, '')
    assert.equal(document.activeElement, input)
    assert.equal(clearButton(container), null)
  } finally { await cleanup() }
})

test('정리 함수가 있는 칸(연락처)도 X로 비워진다', async () => {
  const { container, input, cleanup } = await mount('010-1234-5678', formatPhoneNumber)
  try {
    await act(async () => { input.focus() })
    const button = clearButton(container)
    assert.ok(button)
    await act(async () => { button.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
    assert.equal(input.value, '')
  } finally { await cleanup() }
})

test('X가 보일 때만 칸 오른쪽 여백 44px가 직접 들어간다(화면 CSS가 덮어쓰지 못하게)', async () => {
  const { input, cleanup } = await mount('테스트거래처')
  try {
    assert.equal(input.style.paddingRight, '')
    await act(async () => { input.focus() })
    assert.equal(input.style.paddingRight, '44px')
    await act(async () => { input.blur() })
    assert.equal(input.style.paddingRight, '')
  } finally { await cleanup() }
})
