// 로드맵 32 — 비회원 기록을 못 읽으면 앱 대신 막기 화면(빈 화면에서 입력해 기존 기록을 덮어쓰지 않게).
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, emptyOkHandlers } = createFakeSupabase()
fakeSupabase.auth.getSession = async () => ({ data: { session: null }, error: null })
mock.module('../supabaseClient.js', {
  namedExports: {
    supabase: fakeSupabase,
    getSupabaseAuthErrorMessage: (/** @type {{ message?: string }} */ error) => error?.message || '',
    signInWithGoogle: async () => ({ error: new Error('테스트에서 호출되면 안 됨') }),
    ensureProfileRow: async () => {},
  },
})
resetHandlers()
Object.assign(handlers, emptyOkHandlers())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { act } = React
const { createRoot } = await import('react-dom/client')
const { BrowserRouter } = await import('react-router-dom')
const { default: App } = await import('./App.jsx')
const { storageKeyFor } = await import('../store/persist.js')
const { initializeOwnerFromPersist } = await import('../store/owner-state.js')

const CARS = JSON.stringify([{ id: 'c-main', type: 'main', number: '12가3456' }])
const BROKEN_EXPENSES = JSON.stringify([{ id: 'e-1', kind: 'maint', date: '2026-10-09', cost: 1000, notAllowed: 'x' }])
const GOOD_EXPENSES = JSON.stringify([{ id: 'e-1', kind: 'maint', date: '2026-10-09', cost: 1000 }])

/** @param {{ guest: boolean, expenses: string }} setup */
function seed({ guest, expenses }) {
  localStorage.clear()
  if (guest) localStorage.setItem('reactPracticeGuestMode', '1')
  localStorage.setItem(storageKeyFor('cars', 'guest'), CARS)
  localStorage.setItem(storageKeyFor('expenses', 'guest'), expenses)
}

/** @param {() => boolean} ok */
async function waitUntil(ok, limitMs = 3000) {
  const end = Date.now() + limitMs
  while (!ok() && Date.now() < end) {
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 20) }) })
  }
}

async function mountApp() {
  window.history.pushState({}, '', '/app')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(BrowserRouter, null, React.createElement(App))) })
  return {
    container,
    blocked: () => container.querySelector('[role="alert"] h1')?.textContent === '기록을 불러오지 못했습니다.',
    cleanup: async () => { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('불러오기 결과: 못 읽으면 false, 정상·처음(저장된 것 없음)이면 true', () => {
  localStorage.clear()
  assert.equal(initializeOwnerFromPersist('fresh-owner'), true, '처음 쓰는 사람')
  localStorage.setItem(storageKeyFor('expenses', 'bad-owner'), BROKEN_EXPENSES)
  assert.equal(initializeOwnerFromPersist('bad-owner'), false)
  localStorage.setItem(storageKeyFor('expenses', 'good-owner'), GOOD_EXPENSES)
  assert.equal(initializeOwnerFromPersist('good-owner'), true)
  localStorage.setItem(storageKeyFor('clients', 'parse-owner'), '{깨진 글자')
  assert.equal(initializeOwnerFromPersist('parse-owner'), false, '글자 깨짐')
  localStorage.setItem(storageKeyFor('workData', 'work-owner'), JSON.stringify(['일지가 배열']))
  assert.equal(initializeOwnerFromPersist('work-owner'), false, '일지 읽기 실패')
  const realGetItem = window.Storage.prototype.getItem
  window.Storage.prototype.getItem = () => { throw new Error('저장소 접근 실패') }
  try {
    assert.equal(initializeOwnerFromPersist('getitem-owner'), false, '저장소 접근 실패')
  } finally {
    window.Storage.prototype.getItem = realGetItem
  }
})

test('비회원 기록을 못 읽으면 앱 대신 막기 화면, 저장소는 그대로', async () => {
  seed({ guest: true, expenses: BROKEN_EXPENSES })
  const view = await mountApp()
  try {
    await waitUntil(view.blocked)
    assert.ok(view.blocked(), '막기 화면이 떠야 한다')
    assert.equal(view.container.querySelector('[role="alert"] p')?.textContent, '잠시 후 다시 시도해 주세요.')
    assert.equal(view.container.querySelector('[role="alert"] button')?.textContent, '다시 시도')
    assert.equal(view.container.querySelector('nav[aria-label="하단 메뉴"]'), null, '앱 화면(하단 메뉴)은 안 뜸')
    assert.equal(localStorage.getItem(storageKeyFor('cars', 'guest')), CARS, '저장된 차량 그대로')
    assert.equal(localStorage.getItem(storageKeyFor('expenses', 'guest')), BROKEN_EXPENSES, '저장된 지출 원문 그대로')
  } finally {
    await view.cleanup()
  }
})

test('비회원 기록이 정상이면 지금처럼 앱이 뜬다', async () => {
  seed({ guest: true, expenses: GOOD_EXPENSES })
  const view = await mountApp()
  try {
    await waitUntil(() => !!view.container.querySelector('nav[aria-label="하단 메뉴"]'))
    assert.ok(view.container.querySelector('nav[aria-label="하단 메뉴"]'), '앱 화면')
    assert.equal(view.blocked(), false)
  } finally {
    await view.cleanup()
  }
})

test('아직 비회원으로 시작 안 했으면(로그인 화면) 막지 않는다 — 회원 로그인은 할 수 있어야 함', async () => {
  seed({ guest: false, expenses: BROKEN_EXPENSES })
  const view = await mountApp()
  try {
    await waitUntil(() => window.location.pathname === '/auth')
    assert.equal(window.location.pathname, '/auth')
    assert.equal(view.blocked(), false)
  } finally {
    await view.cleanup()
  }
})
