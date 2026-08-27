// 4차 재작업(사용자 지시 5번) — 실제 <BrowserRouter> + <App/>을 jsdom에 렌더링해서
// "로그인 계정이 라우트를 이동해도 그 경로에 머물고 restoreSessionOnBoot()이
// 재실행되지 않는지"를 검증한다. 순수 함수 추출 테스트로는 이 회귀(브라우저에서
// 실측으로만 드러났던 버그)를 못 잡는다고 판단해, 이 파일 하나를 위해 최소한의
// JSX 렌더 인프라(jsxLoaderHook.mjs, esbuild 트랜스파일)를 도입했다.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { createFakeSupabase, wait } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf, emptyOkHandlers } = createFakeSupabase()
fakeSupabase.auth.getSession = async () => ({
  data: { session: { user: { id: 'user-boot-nav', user_metadata: {}, phone: null } } },
  error: null,
})
mock.module('../supabaseClient.js', {
  exports: {
    supabase: fakeSupabase,
    phoneToFakeEmail: (phone) => `${phone}@runlog-user.com`,
    getSupabaseAuthErrorMessage: (error) => error?.message || '',
    // AuthPage.jsx가 정적으로 import하지만(모든 라우트가 한 <Routes> 트리에
    // 선언돼 있어 이 모듈 자체는 항상 로드된다) 이 테스트는 인증 화면을 안
    // 쓰므로 실제로 호출되지 않는다 — 존재만 하면 된다.
    signInWithPhone: async () => ({ error: new Error('테스트에서 호출되면 안 됨') }),
    signUpWithPhone: async () => ({ error: new Error('테스트에서 호출되면 안 됨') }),
    ensureProfileRow: async () => {},
  },
})

resetHandlers()
Object.assign(handlers, emptyOkHandlers())
handlers.profiles.select = () => ({ data: { id: 'user-boot-nav', name: '테스트 사용자', settings: {} }, error: null })

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { BrowserRouter } = await import('react-router-dom')
const { act } = React
const { default: App } = await import('./App.jsx')

async function waitUntil(predicate, { timeoutMs = 2000, stepMs = 20 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (!predicate() && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- 폴링 대기라 순차 await가 맞다.
    await act(async () => { await wait(stepMs) })
  }
}

test('사용자 지시 5번 — 로그인 계정이 라우트를 이동해도 그 경로에 머물고 부트가 재실행되지 않는다', async () => {
  window.history.pushState({}, '', '/')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  try {
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })

    await waitUntil(() => window.location.pathname === '/app')
    assert.equal(window.location.pathname, '/app', '부트 복원 후 /app에 도착해야 한다')
    const bootProfileCalls = countOf('profiles', 'select')
    assert.ok(bootProfileCalls >= 1, '부트 중 profiles 조회가 최소 1번은 나가야 한다')

    const myPageButton = Array.from(container.querySelectorAll('button'))
      .find((btn) => btn.textContent.includes('마이페이지'))
    assert.ok(myPageButton, '하단 탭에서 마이페이지 버튼을 찾아야 한다')

    await act(async () => {
      myPageButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    assert.equal(window.location.pathname, '/app/me', '클릭 직후에는 /app/me로 이동해야 한다')

    // 버그가 있었다면 이 대기 중에 restoreSessionOnBoot()이 다시 돌고 goHome()이
    // /app으로 강제로 되돌린다 — 넉넉히 기다려도 그런 일이 없어야 한다.
    await act(async () => { await wait(600) })

    assert.equal(window.location.pathname, '/app/me', '라우트 이동 후 시간이 지나도 그 경로에 그대로 머물러야 한다(부트 재실행으로 /app에 되돌아가면 안 된다)')
    assert.equal(countOf('profiles', 'select'), bootProfileCalls, 'restoreSessionOnBoot()이 라우트 전환으로 재실행되면 안 된다(profiles 조회 횟수가 늘면 안 된다)')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
