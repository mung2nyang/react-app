// 로드맵 18-B: 짧은 진동 — 진동 기능 있으면 0.01초 1번, 없으면 조용히. 안내 문구가 뜨면 진동 1번.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, emptyOkHandlers } = createFakeSupabase()
Object.assign(handlers, emptyOkHandlers())
fakeSupabase.auth.getSession = async () => ({ data: { session: null }, error: null })
mock.module('../supabaseClient.js', {
  namedExports: {
    supabase: fakeSupabase,
    getSupabaseAuthErrorMessage: () => '',
    signInWithGoogle: async () => ({ error: null }),
    ensureProfileRow: async () => {},
  },
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { MemoryRouter } = await import('react-router-dom')
const { buzz, BUZZ_MS } = await import('./haptic.js')
const { useAppSession } = await import('../app/useAppSession.js')

test('진동 기능이 있으면 0.01초 1번, 없거나 막히면 오류 없이 넘어감', () => {
  /** @type {Array<number>} */
  const calls = []
  buzz({ vibrate: (ms) => { calls.push(ms); return true } })
  assert.deepEqual(calls, [BUZZ_MS])
  assert.equal(BUZZ_MS, 10)
  assert.doesNotThrow(() => buzz({}))
  assert.doesNotThrow(() => buzz(undefined))
  assert.doesNotThrow(() => buzz({ vibrate: () => { throw new Error('막힘') } }))
})

test('화면: 안내 문구가 뜨면 진동이 1번 불림', async () => {
  /** @type {Array<number>} */
  const calls = []
  const original = Reflect.get(window.navigator, 'vibrate')
  Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: (/** @type {number} */ ms) => { calls.push(ms); return true } })
  /** @type {{ current: ((message: string) => void) | null }} */
  const show = { current: null }
  function Probe() {
    const app = useAppSession()
    show.current = app.showToast
    return null
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => { root.render(React.createElement(MemoryRouter, { initialEntries: ['/auth'] }, React.createElement(Probe))) })
    assert.deepEqual(calls, [], '안내 문구 전엔 진동 없음')
    await act(async () => { show.current?.('저장했습니다.') })
    assert.deepEqual(calls, [BUZZ_MS])
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
    Object.defineProperty(window.navigator, 'vibrate', { configurable: true, value: original })
  }
})
