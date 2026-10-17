// 로드맵 82-C — 앱 설정 노선 등록: 빈 칸은 추가 전에 빨간 표시·칸 아래 문구·커서(상차지 → 하차지).
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
const { default: RoutePresetEditor } = await import('./RoutePresetEditor.jsx')
const { normalizeSettings } = await import('../domain/practiceSettings.js')

/** @param {import('react').ReactElement} element */
async function render(element) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(element) })
  return { container, async cleanup() { await act(async () => { root.unmount() }); container.remove() } }
}

/** @param {string} label */
async function click(label) {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent === label)
  assert.ok(button, `${label} 버튼`)
  await act(async () => { button.click() })
}

/** React 제어 입력에 값을 넣고 input 이벤트를 보낸다. @param {HTMLInputElement} input @param {string} value */
async function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set
  await act(async () => { setter?.call(input, value); input.dispatchEvent(new window.Event('input', { bubbles: true })) })
}

test('상차지만 넣고 추가 → 하차지 칸 표시·문구·커서, 추가 안 함, 채우면 사라짐', async () => {
  /** @type {Array<object>} */
  const patches = []
  const view = await render(React.createElement(RoutePresetEditor, { scope: 'main', settings: normalizeSettings({}), onPatch: (/** @type {object} */ patch) => { patches.push(patch) } }))
  try {
    const load = /** @type {HTMLInputElement} */ (view.container.querySelector('#routePresetLoad-main'))
    const unload = /** @type {HTMLInputElement} */ (view.container.querySelector('#routePresetUnload-main'))
    await typeInto(load, '부산')
    await click('추가')
    assert.equal(patches.length, 0)
    assert.equal(unload.getAttribute('aria-invalid'), 'true')
    assert.equal(load.getAttribute('aria-invalid'), null)
    assert.equal(view.container.querySelector('#routePresetUnload-main-error')?.textContent, '하차지를 입력해 주세요.')
    assert.equal(document.activeElement, unload)
    await typeInto(unload, '대구')
    assert.equal(unload.getAttribute('aria-invalid'), null)
    await click('추가')
    assert.equal(patches.length, 1)
  } finally { await view.cleanup() }
})

test('둘 다 비면 상차지 칸부터', async () => {
  const view = await render(React.createElement(RoutePresetEditor, { scope: 'sub', settings: normalizeSettings({}), onPatch() {} }))
  try {
    await click('추가')
    assert.equal(view.container.querySelector('#routePresetLoad-sub-error')?.textContent, '상차지를 입력해 주세요.')
  } finally { await view.cleanup() }
})
