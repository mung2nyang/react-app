// 10-L 수정: /auth에서 세션이 이미 있으면(다시 켤 때 부트 복원 직후 — 홈 이동은 라우터가 늦게 처리) 로그인 화면 대신 로딩 표시,
// 그래도 다른 화면으로 안 넘어가면 잠시 뒤 /app으로.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

mock.module('../supabaseClient.js', {
  namedExports: {
    getSupabaseAuthErrorMessage: () => '',
    signInWithGoogle: async () => ({ error: null }),
  },
})

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { MemoryRouter, Routes, Route } = await import('react-router-dom')
const { act } = React
const { default: AuthRoute, AUTH_WITH_SESSION_REDIRECT_MS } = await import('./AuthRoute.jsx')

/** @param {Record<string, unknown>|null} session @param {boolean} booting */
async function render(session, booting) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const h = React.createElement
  await act(async () => {
    root.render(h(MemoryRouter, { initialEntries: ['/auth'] },
      h(Routes, null,
        h(Route, { path: '/auth', element: h(AuthRoute, { booting, session, showToast: () => {} }) }),
        h(Route, { path: '/app', element: h('div', { id: 'home' }, '홈') }))))
  })
  return { container, async cleanup() { await act(async () => { root.unmount() }); container.remove() } }
}

/** @param {HTMLElement} container */
function hasLoginButton(container) {
  return [...container.querySelectorAll('button')].some((b) => b.textContent === 'Google 계정으로 로그인')
}

test('세션 없음 + 부트 끝: 로그인 첫 화면', async () => {
  const view = await render(null, false)
  try {
    assert.equal(hasLoginButton(view.container), true)
    assert.equal(view.container.querySelector('.boot-loading'), null)
  } finally { await view.cleanup() }
})

test('세션 있음(부트 직후): 로그인 화면 대신 로딩 표시, 안 넘어가면 잠시 뒤 /app', async () => {
  const view = await render({ userId: 'u-1', name: '차주' }, false)
  try {
    assert.equal(hasLoginButton(view.container), false, '로그인 화면이 비치지 않는다')
    assert.ok(view.container.querySelector('.boot-loading'))
    await act(async () => { await new Promise((r) => setTimeout(r, AUTH_WITH_SESSION_REDIRECT_MS + 100)) })
    assert.ok(view.container.querySelector('#home'), '/app으로 이동')
  } finally { await view.cleanup() }
})
