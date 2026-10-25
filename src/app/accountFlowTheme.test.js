// 계정 화면(로그인·환영·첫 설정)은 테마를 덮지 않고 마지막 테마를 둔다 — 로그아웃해도 라이트로 바뀌지 않게.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { createFakeSupabase, wait } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, emptyOkHandlers } = createFakeSupabase()
fakeSupabase.auth.getSession = async () => ({ data: { session: null }, error: null })
mock.module('../data/cloud/supabaseClient.ts', {
  namedExports: {
    supabase: fakeSupabase,
    getSupabaseAuthErrorMessage: (error) => error?.message || '',
    signInWithGoogle: async () => ({ error: new Error('테스트에서 호출되면 안 됨') }),
    ensureProfileRow: async () => {},
  },
})

Object.assign(handlers, emptyOkHandlers())
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { BrowserRouter } = await import('react-router-dom')
const { default: App } = await import('./App.jsx')
const { commitSettings } = await import('../data/store/commitHelpers.ts')
const { normalizeSettings } = await import('../domain/practiceSettings.ts')
const { endCloudSession } = await import('../data/cloud/cloudSession.ts')
const { clearGuestModePersisted } = await import('./guestSessionPersist.js')

async function waitUntil(predicate, { timeoutMs = 5000, stepMs = 20 } = {}) {
  let ok = false
  await act(async () => {
    const deadline = Date.now() + timeoutMs
    while (!predicate() && Date.now() < deadline) {
      await wait(stepMs)
    }
    ok = predicate()
  })
  if (!ok) throw new Error('waitUntil timeout')
}

/** @param {(container: HTMLElement) => Promise<void>} body */
async function withApp(body) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(BrowserRouter, null, React.createElement(App)))
    })
    await body(container)
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
    endCloudSession()
    clearGuestModePersisted()
    commitSettings('guest', normalizeSettings({}))
    document.documentElement.removeAttribute('data-theme')
    localStorage.removeItem('lastTheme')
  }
}

test('다크로 쓰다 로그아웃해 로그인 화면에 오면 다크와 마지막 테마 기억이 그대로 남는다', async () => {
  document.documentElement.setAttribute('data-theme', 'dark')
  localStorage.setItem('lastTheme', 'dark')
  window.history.pushState({}, '', '/auth')
  await withApp(async (container) => {
    await waitUntil(() => !!container.querySelector('.auth-guest-btn'))
    await act(async () => { await wait(50) })
    assert.equal(document.documentElement.getAttribute('data-theme'), 'dark', '로그인 화면에서 라이트로 덮으면 안 된다')
    assert.equal(localStorage.getItem('lastTheme'), 'dark', '마지막 테마 기억도 그대로')
    assert.equal(document.body.classList.contains('account-flow-active'), false, '계정 화면 강제 다크 클래스는 없다')
  })
})

test('로그인 화면을 지나 앱 안으로 들어가면 그 계정 설정의 테마로 칠한다', async () => {
  commitSettings('guest', normalizeSettings({ theme: 'dark' }))
  window.history.pushState({}, '', '/auth')
  await withApp(async (container) => {
    await waitUntil(() => !!container.querySelector('.auth-guest-btn'))
    assert.equal(document.documentElement.getAttribute('data-theme'), null, '로그인 화면은 아직 마지막 테마(라이트)')
    const guestBtn = container.querySelector('.auth-guest-btn')
    await act(async () => {
      guestBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await waitUntil(() => window.location.pathname === '/app', { timeoutMs: 8000 })
    await waitUntil(() => document.documentElement.getAttribute('data-theme') === 'dark')
    assert.equal(localStorage.getItem('lastTheme'), 'dark')
  })
})
