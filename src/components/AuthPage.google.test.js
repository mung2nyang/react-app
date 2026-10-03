// 구글 로그인 G-1·G-3 — 첫 화면은 [Google로 시작하기]·[비회원으로 시작하기]만: 누르면 구글 로그인 함수를 한 번 부르고, 실패하면 토스트 + 버튼 다시 누를 수 있음.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

/** @type {{ error: { message: string } | null }} */
let googleResult = { error: null }
let googleCalls = 0
mock.module('../supabaseClient.js', {
  namedExports: {
    ensureProfileRow: async () => {},
    getSupabaseAuthErrorMessage: (/** @type {{ message?: string } | null} */ error) => error?.message || '오류',
    signInWithGoogle: async () => { googleCalls += 1; return googleResult },
  },
})

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: AuthPage } = await import('./AuthPage.jsx')

async function render() {
  /** @type {string[]} */
  const toasts = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(AuthPage, {
      onGuest: () => {}, showToast: (/** @type {string} */ m) => { toasts.push(m) },
    }))
  })
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Google로 시작하기')
  return { toasts, button, labels: [...container.querySelectorAll('button')].map((b) => b.textContent), async cleanup() { await act(async () => { root.unmount() }); container.remove() } }
}

test('첫 화면에 [Google로 시작하기]가 있고 누르면 구글 로그인 함수를 한 번 부른다(성공 시 버튼은 잠긴 채 구글 화면으로)', async () => {
  googleCalls = 0
  googleResult = { error: null }
  const view = await render()
  try {
    assert.ok(view.button, 'Google로 시작하기 버튼')
    await act(async () => { view.button?.click() })
    assert.equal(googleCalls, 1)
    assert.equal(view.button?.disabled, true)
    assert.deepEqual(view.toasts, [])
  } finally { await view.cleanup() }
})

test('구글 로그인 시작이 실패하면 토스트를 띄우고 버튼을 다시 누를 수 있다', async () => {
  googleCalls = 0
  googleResult = { error: { message: '구글 로그인을 시작하지 못했습니다' } }
  const view = await render()
  try {
    await act(async () => { view.button?.click() })
    assert.equal(googleCalls, 1)
    assert.deepEqual(view.toasts, ['구글 로그인을 시작하지 못했습니다'])
    assert.equal(view.button?.disabled, false)
  } finally { await view.cleanup() }
})

test('첫 화면엔 구글·비회원 버튼만 있다(전화번호 로그인·회원가입 없음, G-3)', async () => {
  const view = await render()
  try {
    assert.deepEqual(view.labels, ['Google로 시작하기', '비회원으로 시작하기'])
  } finally { await view.cleanup() }
})
