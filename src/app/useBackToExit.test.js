// 로드맵 17번: 설치 앱 홈에서 뒤로가기 1번 → 안내, 안내 시간 안엔 붙잡기 안 쌓음(한 번 더 = 종료), 지나면 다시 쌓음. 브라우저 탭은 그대로.
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
const { BrowserRouter } = await import('react-router-dom')
const { default: useBackToExit, isExitEdge, EXIT_HINT } = await import('./useBackToExit.js')

/** @param {boolean} standalone */
function setStandalone(standalone) {
  Reflect.set(window, 'matchMedia', (/** @type {string} */ query) => ({ matches: standalone && query.includes('standalone') }))
}

/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

/** @param {boolean} standalone */
async function mount(standalone) {
  setStandalone(standalone)
  window.history.replaceState(null, '', '/app')
  const startLength = window.history.length
  /** @type {Array<string>} */
  const toasts = []
  function Probe() {
    useBackToExit((message) => { toasts.push(message) }, 60)
    return null
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(BrowserRouter, null, React.createElement(Probe))) })
  const idx = () => Reflect.get(window.history.state || {}, 'idx')
  const back = async () => {
    await act(async () => { window.history.back(); await wait(20) })
  }
  return { toasts, idx, back, added: () => window.history.length - startLength, cleanup: async () => { await act(async () => { root.unmount() }); container.remove() } }
}

test('조건: 설치 앱 + 홈 + 첫 기록일 때만', () => {
  assert.equal(isExitEdge({ standalone: true, pathname: '/app', idx: 0 }), true)
  assert.equal(isExitEdge({ standalone: false, pathname: '/app', idx: 0 }), false, '브라우저 탭')
  assert.equal(isExitEdge({ standalone: true, pathname: '/app/revenue', idx: 0 }), false, '다른 화면')
  assert.equal(isExitEdge({ standalone: true, pathname: '/app', idx: 2 }), false, '앞 기록 있음')
  assert.equal(isExitEdge({ standalone: true, pathname: '/app', idx: undefined }), false)
})

test('설치 앱 홈: 붙잡기 기록 1개 → 뒤로 1번이면 안내 + 홈 그대로, 안내 시간 안엔 안 쌓고 지나면 다시 쌓음', async () => {
  const view = await mount(true)
  try {
    assert.equal(view.idx(), 1, '붙잡기 기록이 쌓여 있어야 한다')
    await view.back()
    assert.equal(window.location.pathname, '/app')
    assert.equal(view.idx(), 0)
    assert.deepEqual(view.toasts, [EXIT_HINT])
    assert.equal(view.idx(), 0, '안내 시간 안엔 다시 안 쌓음(한 번 더 누르면 종료)')
    await act(async () => { await wait(120) })
    assert.equal(view.idx(), 1, '안내 시간이 지나면 다시 붙잡기')
    assert.deepEqual(view.toasts, [EXIT_HINT], '안내는 뒤로가기 때만')
  } finally {
    await view.cleanup()
  }
})

test('브라우저 탭: 기록을 안 쌓고 안내도 없음', async () => {
  const view = await mount(false)
  try {
    assert.equal(view.idx(), 0)
    assert.equal(view.added(), 0)
    assert.deepEqual(view.toasts, [])
  } finally {
    await view.cleanup()
  }
})
