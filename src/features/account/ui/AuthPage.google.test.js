// 구글 로그인 G-1·G-3 — 첫 화면은 [Google 계정으로 로그인하기]·[비회원으로 시작하기]만: 누르면 구글 로그인 함수를 한 번 부르고, 실패하면 토스트 + 버튼 다시 누를 수 있음.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

/** @type {{ error: { message: string } | null }} */
let googleResult = { error: null }
let googleCalls = 0
mock.module('../../../data/cloud/supabaseClient.ts', {
  namedExports: {
    ensureProfileRow: async () => {},
    getSupabaseAuthErrorMessage: (/** @type {{ message?: string } | null} */ error) => error?.message || '오류',
    signInWithGoogle: async () => { googleCalls += 1; return googleResult },
  },
})

const React = await import('react')
const { withToast } = await import('../../../testSupport/withToast.js')
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
    root.render(withToast(React.createElement(AuthPage, {
      onGuest: () => {},
    }), (/** @type {string} */ m) => { toasts.push(m) }))
  })
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Google 계정으로 로그인하기')
  return { container, toasts, button, labels: [...container.querySelectorAll('button')].map((b) => b.textContent), async cleanup() { await act(async () => { root.unmount() }); container.remove() } }
}

test('첫 화면에 [Google 계정으로 로그인하기]가 있고 누르면 구글 로그인 함수를 한 번 부른다(성공 시 버튼은 잠긴 채 구글 화면으로)', async () => {
  googleCalls = 0
  googleResult = { error: null }
  const view = await render()
  try {
    assert.ok(view.button, 'Google 계정으로 로그인하기 버튼')
    await act(async () => { view.button?.click() })
    assert.equal(googleCalls, 1)
    assert.equal(view.button?.disabled, true)
    assert.deepEqual(view.toasts, [])
    assert.ok(view.button?.querySelector('.boot-loading-dots'), '기다리는 동안 버튼 안에 점 세 개')
    assert.equal(view.button?.getAttribute('aria-busy'), 'true')
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
    assert.equal(view.button?.querySelector('.boot-loading-dots'), null, '실패하면 점이 사라지고 원래 버튼')
  } finally { await view.cleanup() }
})

test('첫 화면에 소개 문구와 약관 안내가 있고 약관 문서 이름은 링크가 아니다', async () => {
  const view = await render()
  try {
    assert.equal(view.container.querySelector('h1')?.textContent, '운행 기록을간편하게 관리하세요')
    assert.equal(view.container.querySelector('.auth-intro-eyebrow')?.textContent, '간편한 화물 차량 운행 관리')
    assert.equal(view.container.querySelector('.auth-desc-text')?.textContent, '매일의 운행 내역을 쉽고 빠르게 기록해 보세요.')
    const terms = view.container.querySelector('.auth-intro-terms')
    assert.equal(terms?.textContent?.replace(/\s+/g, ' ').trim(), '최초 로그인 시 서비스 이용약관 및 개인정보 처리방침, 위치기반서비스 이용약관에 동의하는 것으로 간주합니다.')
    assert.deepEqual([...(terms?.querySelectorAll('.auth-intro-term') ?? [])].map((el) => el.textContent), ['서비스 이용약관', '개인정보 처리방침', '위치기반서비스 이용약관'])
    assert.equal(view.container.querySelectorAll('a').length, 0)
  } finally { await view.cleanup() }
})

test('첫 화면엔 구글·비회원 버튼만 있다(전화번호 로그인·회원가입 없음, G-3)', async () => {
  const view = await render()
  try {
    assert.deepEqual(view.labels, ['Google 계정으로 로그인하기', '비회원으로 시작하기'])
  } finally { await view.cleanup() }
})
