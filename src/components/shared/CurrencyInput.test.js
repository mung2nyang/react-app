// @ts-check
// 금액 칸 — 칸 안엔 친 글자(소수점 포함), 폼엔 반올림한 쉼표 정수만(로드맵 43).
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
const { default: CurrencyInput } = await import('./CurrencyInput.jsx')

/** @param {{ initial: string, seen: Array<string> }} props */
function Harness({ initial, seen }) {
  const [value, setValue] = useState(initial)
  return React.createElement(CurrencyInput, {
    id: 'fare',
    value,
    onValueChange: (next) => { seen.push(next); setValue(next) },
  })
}

/** @param {HTMLInputElement} el @param {string} value */
async function typeInto(el, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set
  assert.ok(setter)
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

async function mount(initial = '') {
  /** @type {Array<string>} */
  const seen = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(Harness, { initial, seen })) })
  const input = /** @type {HTMLInputElement} */ (container.querySelector('input#fare'))
  assert.ok(input)
  return { input, seen, cleanup: async () => { await act(async () => { root.unmount() }); container.remove() } }
}

test('12345 → . → 6 순서로 쳐도 10배가 되지 않고 폼엔 12,346, 칸엔 12,345.6', async () => {
  const { input, seen, cleanup } = await mount()
  try {
    await typeInto(input, '12345')
    assert.equal(input.value, '12,345')
    await typeInto(input, '12,345.')
    assert.equal(input.value, '12,345.')
    await typeInto(input, '12,345.6')
    assert.equal(input.value, '12,345.6')
    assert.deepEqual(seen, ['12,345', '12,345', '12,346'])
    assert.equal(seen.some((v) => v.includes('.')), false, '폼에는 점이 절대 안 간다')
    await act(async () => { input.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })) })
    assert.equal(input.value, '12,346', '칸에서 나가면 정리된 금액')
  } finally {
    await cleanup()
  }
})

test('점 없이 치면 지금 금액 칸과 같다', async () => {
  const { input, seen, cleanup } = await mount('5,000')
  try {
    assert.equal(input.value, '5,000')
    await typeInto(input, '100000')
    assert.equal(input.value, '100,000')
    assert.deepEqual(seen, ['100,000'])
  } finally {
    await cleanup()
  }
})
