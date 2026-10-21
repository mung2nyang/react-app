// 로드맵 96: 앱 안(/app 아래)에서 모르는 주소로 들어오면 빈 칸 대신 홈(/app)으로 바꿔 보낸다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, emptyOkHandlers } = createFakeSupabase()
fakeSupabase.auth.getSession = async () => ({ data: { session: null }, error: null })
mock.module('../data/cloud/supabaseClient.js', {
  namedExports: {
    supabase: fakeSupabase,
    getSupabaseAuthErrorMessage: (/** @type {{ message?: string }|null} */ error) => error?.message || '',
    signInWithGoogle: async () => ({ error: new Error('테스트에서 호출되면 안 됨') }),
    ensureProfileRow: async () => {},
  },
})
Object.assign(handlers, emptyOkHandlers())
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { BrowserRouter } = await import('react-router-dom')
const { default: App } = await import('./App.jsx')
const { setGuestModePersisted, clearGuestModePersisted } = await import('./guestSessionPersist.js')

/** @param {() => boolean} predicate */
async function waitUntil(predicate, timeoutMs = 3000) {
  await act(async () => {
    const deadline = Date.now() + timeoutMs
    while (!predicate() && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop -- 폴링 대기라 순차 await가 맞다.
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  })
}

test('비회원이 /app 아래 없는 주소로 들어오면 홈(/app)으로 바뀌고 홈 화면이 보인다', async () => {
  setGuestModePersisted(true)
  for (const path of ['/app/xyz', '/app/logs/no-car/엉뚱']) {
    window.history.pushState({}, '', path)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => { root.render(React.createElement(BrowserRouter, null, React.createElement(App))) })
      await waitUntil(() => window.location.pathname === '/app' && (container.textContent || '').includes('운행 기록하기'))
      assert.equal(window.location.pathname, '/app', `${path}는 /app으로 바뀌어야 한다`)
      assert.ok((container.textContent || '').includes('운행 기록하기'), `${path}에서 홈 화면 글자가 보여야 한다`)
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  }
  clearGuestModePersisted()
})
