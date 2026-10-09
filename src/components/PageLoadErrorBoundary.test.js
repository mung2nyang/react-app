// 로드맵 33 — 화면 오류 때 앱 전체가 사라지는 대신 안내, 다른 화면으로 가면 풀림.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { default: PageLoadErrorBoundary } = await import('./PageLoadErrorBoundary.jsx')

/** @param {{ broken: boolean }} props */
function Page({ broken }) {
  if (broken) throw new Error('Failed to fetch dynamically imported module')
  return React.createElement('p', { className: 'page-ok' }, '정상 화면')
}

test('정상 화면은 그대로, 오류면 안내, 다른 화면으로 가면 풀림', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  // 예상한 오류(일부러 던진 화면 오류·경계 기록)만 숨기고, 나머지는 원래대로 내보낸다(플레이북 §6).
  const original = console.error
  const expected = (/** @type {Array<unknown>} */ args) => args.some((arg) => /Failed to fetch dynamically imported module|\[PageLoadErrorBoundary\]/.test(String(arg instanceof Error ? arg.message : arg)))
  const logged = mock.method(console, 'error', (/** @type {Array<unknown>} */ ...args) => { if (!expected(args)) original(...args) })
  /** @param {string} path @param {boolean} broken */
  const show = async (path, broken) => {
    await act(async () => { root.render(React.createElement(PageLoadErrorBoundary, { resetKey: path }, React.createElement(Page, { broken }))) })
  }
  try {
    await show('/app', false)
    assert.ok(container.querySelector('.page-ok'))
    await show('/app/revenue', true)
    assert.equal(container.querySelector('[role="alert"] h1')?.textContent, '화면을 불러오지 못했습니다.')
    assert.equal(container.querySelector('[role="alert"] p')?.textContent, '잠시 후 다시 시도해 주세요.')
    assert.equal(container.querySelector('[role="alert"] button')?.textContent, '다시 시도')
    await show('/app', false)
    assert.ok(container.querySelector('.page-ok'), '다른 화면으로 가면 안내가 풀린다')
    assert.equal(container.querySelector('[role="alert"]'), null)
    assert.ok(logged.mock.calls.some((call) => String(call.arguments[0]).includes('[PageLoadErrorBoundary]')))
  } finally {
    logged.mock.restore()
    await act(async () => { root.unmount() })
    container.remove()
  }
})
