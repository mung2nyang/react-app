// @ts-check
// 횟수 버튼 설정 — × 버튼 없이 길게 누르면 확인 창 → 확인 시 삭제, 짧게 누르면 삭제 안 됨.
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
const { default: RunCountChips } = await import('./RunCountChips.jsx')

/** @typedef {import('../domain/financeTypes.js').FinanceSettings} FinanceSettings */

/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

/** @param {Array<number>} presets */
async function mount(presets) {
  /** @type {Array<Partial<FinanceSettings>>} */
  const patches = []
  const settings = /** @type {FinanceSettings} */ ({ runCountPresets: presets })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(RunCountChips, { scope: 'main', settings, onPatch: (patch) => { patches.push(patch) } }))
  })
  return {
    container,
    patches,
    cleanup: async () => {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

/** @param {HTMLElement} container @param {number} index */
function chip(container, index) {
  const el = container.querySelectorAll('.run-count-preset-chip')[index]
  assert.ok(el)
  return el
}

/** @param {Element} el @param {string} type */
function fire(el, type) {
  el.dispatchEvent(new window.Event(type, { bubbles: true }))
}

test('× 삭제 버튼이 없고 안내 문구가 길게 누르기 방식이다', async () => {
  const { container, cleanup } = await mount([1, 2, 3])
  try {
    assert.equal(container.querySelector('.run-count-preset-chip-remove'), null)
    assert.ok((container.textContent ?? '').includes('버튼을 길게 누르면 삭제할 수 있습니다.'))
  } finally { await cleanup() }
})

test('길게 누르면 확인 창이 뜨고, 확인하면 그 버튼이 삭제된다', async () => {
  const { container, patches, cleanup } = await mount([1, 2, 3])
  try {
    fire(chip(container, 1), 'pointerdown')
    await act(async () => { await wait(700) })
    assert.ok((container.textContent ?? '').includes('2회 버튼을 삭제할까요?'))
    const confirm = container.querySelector('.modal-btn.confirm')
    assert.ok(confirm)
    await act(async () => { /** @type {HTMLButtonElement} */ (confirm).click() })
    assert.deepEqual(patches.at(-1)?.runCountPresets, [1, 3])
    assert.equal(container.querySelector('.modal-overlay'), null)
  } finally { await cleanup() }
})

test('짧게 누르고 떼면 확인 창이 뜨지 않는다', async () => {
  const { container, patches, cleanup } = await mount([1, 2, 3])
  try {
    fire(chip(container, 0), 'pointerdown')
    await act(async () => { await wait(100) })
    fire(chip(container, 0), 'pointerup')
    await act(async () => { await wait(700) })
    assert.equal(container.querySelector('.modal-overlay'), null)
    assert.equal(patches.length, 0)
  } finally { await cleanup() }
})

test('버튼이 1개뿐이면 길게 눌러도 삭제 창이 뜨지 않는다', async () => {
  const { container, cleanup } = await mount([1])
  try {
    fire(chip(container, 0), 'pointerdown')
    await act(async () => { await wait(700) })
    assert.equal(container.querySelector('.modal-overlay'), null)
  } finally { await cleanup() }
})
