// 로드맵 20-A: 일지 입력 칸이 펼쳐진 뒤·고르는 항목이 바뀔 때만 칸 맨 위로 내려감. 닫힘·같은 항목이면 안 내려감.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: InlineSheet } = await import('./InlineSheet.jsx')

/** @param {{ reduce?: boolean }} [options] */
async function mount({ reduce = false } = {}) {
  Reflect.set(window, 'matchMedia', (/** @type {string} */ query) => ({ matches: reduce && query.includes('reduced-motion') }))
  /** @type {Array<{ block?: string, behavior?: string }>} */
  const calls = []
  const proto = /** @type {{ scrollIntoView?: unknown }} */ (window.HTMLElement.prototype)
  const original = proto.scrollIntoView
  proto.scrollIntoView = function scrollIntoView(/** @type {{ block?: string, behavior?: string }} */ options) { calls.push(options) }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  /** @param {boolean} open @param {string} [scrollKey] */
  const render = async (open, scrollKey) => {
    await act(async () => { root.render(React.createElement(InlineSheet, { open, scrollKey }, React.createElement('p', null, '양식'))) })
  }
  const finishGrow = async () => {
    const sheet = /** @type {HTMLElement} */ (container.querySelector('.inline-sheet'))
    const event = new window.Event('transitionend', { bubbles: true })
    Object.defineProperty(event, 'propertyName', { value: 'grid-template-rows' })
    await act(async () => { sheet.dispatchEvent(event) })
  }
  const cleanup = async () => {
    await act(async () => { root.unmount() })
    container.remove()
    proto.scrollIntoView = original
  }
  return { calls, render, finishGrow, cleanup }
}

test('열림: 펼쳐짐이 끝나면 칸 맨 위로 부드럽게 1번', async () => {
  const view = await mount()
  try {
    await view.render(true, 'new')
    assert.equal(view.calls.length, 0, '펼쳐지는 중엔 안 내려감')
    await view.finishGrow()
    assert.deepEqual(view.calls, [{ block: 'start', behavior: 'smooth' }])
  } finally {
    await view.cleanup()
  }
})

test('열린 채 고르는 항목이 바뀌면 다시 1번, 같은 항목이면 안 내려감', async () => {
  const view = await mount()
  try {
    await view.render(true, 'new')
    await view.finishGrow()
    await view.render(true, 'new')
    assert.equal(view.calls.length, 1, '같은 항목')
    await view.render(true, 'c2')
    assert.equal(view.calls.length, 2, '다른 항목으로 바뀜')
  } finally {
    await view.cleanup()
  }
})

test('닫힘·scrollKey 없음이면 안 내려감, 동작 줄이기면 바로 이동', async () => {
  const closed = await mount()
  try {
    await closed.render(true, 'new')
    await closed.finishGrow()
    await closed.render(false, 'new')
    await closed.finishGrow()
    assert.equal(closed.calls.length, 1, '닫을 땐 안 내려감')
  } finally {
    await closed.cleanup()
  }
  const noKey = await mount()
  try {
    await noKey.render(true)
    await noKey.finishGrow()
    assert.equal(noKey.calls.length, 0)
  } finally {
    await noKey.cleanup()
  }
  const reduced = await mount({ reduce: true })
  try {
    await reduced.render(true, 'new')
    await reduced.finishGrow()
    assert.deepEqual(reduced.calls, [{ block: 'start', behavior: 'auto' }])
  } finally {
    await reduced.cleanup()
  }
})
