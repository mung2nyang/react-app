// @ts-check
// 로드맵 23-B — 관리자 화면: 관리자가 아니면 홈으로, 관리자면 목록·답변하기·저장.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'
import { createFakeSupabase } from '../../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf } = createFakeSupabase()
mock.module('../../../data/cloud/supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { MemoryRouter, Route, Routes } = await import('react-router-dom')
const { act } = React
const { withSession } = await import('../../../testSupport/withSession.js')
const { withToast } = await import('../../../testSupport/withToast.js')
const { beginSessionEpoch } = await import('../../../data/cloud/cloudSession.ts')
const { setHydration } = await import('../../../data/store/app-store.ts')
const { default: AdminInquiriesPage } = await import('./AdminInquiriesPage.tsx')

const SESSION = { userId: 'admin-1', name: '보리', accountType: 'owner' }

/** @type {import('../../../domain/jsonTypes.ts').JsonRecord} */
const FIRST = { id: 'q-1', type: '문의', title: '첫 문의', content: '줄1\n줄2', answer: null, answered_at: null, created_at: '2026-10-22T01:00:00Z', user_name: '홍길동' }

/** @type {Array<string>} */
let toasts = []
/** @type {Array<import('../../../data/store/atomicPersist.ts').JsonValue>} */
let rows = []

beforeEach(() => {
  resetHandlers()
  toasts = []
  rows = [
    FIRST,
    { id: 'q-2', type: '오류 신고', title: '둘째', content: '내용', answer: '이미 답함', answered_at: '2026-10-22T02:00:00Z', created_at: '2026-10-21T01:00:00Z', user_name: null },
  ]
  beginSessionEpoch('admin-1', 'admin-1')
  setHydration({ status: 'ready', userId: 'admin-1', ownerKey: 'admin-1' })
})

/** @param {boolean} admin */
function serverSays(admin) {
  handlers.rpc = {
    is_admin: () => ({ data: admin, error: null }),
    admin_list_support_inquiries: () => ({ data: rows, error: null }),
  }
}

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

async function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const page = React.createElement(Routes, null,
    React.createElement(Route, { path: '/app', element: React.createElement('div', { className: 'home-marker' }, '홈') }),
    React.createElement(Route, { path: '/app/admin/inquiries', element: React.createElement(AdminInquiriesPage, { onBack: () => {} }) }),
  )
  const tree = React.createElement(MemoryRouter, { initialEntries: ['/app/admin/inquiries'] }, page)
  await act(async () => { root.render(withToast(withSession(tree, { session: SESSION, ownerKey: 'admin-1' }), (message) => { toasts.push(message) })) })
  await flush()
  await flush()
  return {
    container,
    cleanup: async () => { await act(async () => { root.unmount() }); container.remove() },
  }
}

/** @param {Element} root @param {string} label */
function button(root, label) {
  const found = [...root.querySelectorAll('button')].find((el) => el.textContent?.trim() === label)
  assert.ok(found instanceof window.HTMLButtonElement, `${label} 버튼`)
  return found
}

/** @param {Element|null} el @param {string} value */
async function type(el, value) {
  assert.ok(el instanceof window.HTMLTextAreaElement)
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(el, value)
    el.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

test('관리자가 아니면 홈으로 가고 목록을 안 부른다', async () => {
  serverSays(false)
  const { container, cleanup } = await mount()
  try {
    assert.ok(container.querySelector('.home-marker'))
    assert.equal(countOf('rpc', 'admin_list_support_inquiries'), 0)
  } finally { await cleanup() }
})

test('관리자면 답변 대기 건수·카드·이름(없으면 "이름 없음")이 보인다', async () => {
  serverSays(true)
  const { container, cleanup } = await mount()
  try {
    assert.ok(container.textContent?.includes('관리자'))
    assert.ok(container.textContent?.includes('문의 관리'))
    assert.ok(container.textContent?.includes('답변 대기 1건'))
    const cards = container.querySelectorAll('.admin-inquiry-card')
    assert.equal(cards.length, 2)
    assert.ok(cards[0].textContent?.includes('홍길동'))
    assert.ok(cards[0].textContent?.includes('답변하기'))
    assert.ok(cards[1].textContent?.includes('이름 없음'))
    assert.ok(cards[1].textContent?.includes('이미 답함'))
    assert.ok(cards[1].textContent?.includes('답변 수정'))
  } finally { await cleanup() }
})

test('답변하기 → 저장: 서버 1번·알림·목록 다시 불러옴, 글 칸 닫힘', async () => {
  serverSays(true)
  /** @type {Array<import('../../../data/store/atomicPersist.ts').JsonValue|undefined>} */
  const saved = []
  handlers.rpc.admin_answer_support_inquiry = (args) => { saved.push(args); return { data: null, error: null } }
  const { container, cleanup } = await mount()
  try {
    const first = container.querySelectorAll('.admin-inquiry-card')[0]
    await act(async () => { button(first, '답변하기').click() })
    assert.equal(button(first, '저장').disabled, true, '빈 글이면 저장 못 누름')
    await type(first.querySelector('textarea'), '확인했습니다')
    rows = [{ ...FIRST, answer: '확인했습니다', answered_at: '2026-10-22T03:00:00Z' }]
    await act(async () => { button(first, '저장').click() })
    await flush()
    assert.deepEqual(saved, [{ inquiry_id: 'q-1', answer_text: '확인했습니다' }])
    assert.deepEqual(toasts, ['답변을 저장했습니다.'])
    assert.equal(countOf('rpc', 'admin_list_support_inquiries'), 2)
    assert.equal(container.querySelector('textarea'), null)
    assert.ok(container.textContent?.includes('답변 대기 0건'))
  } finally { await cleanup() }
})

test('저장 실패면 쓴 글이 그대로 남는다', async (t) => {
  t.mock.method(console, 'error', () => {})
  serverSays(true)
  handlers.rpc.admin_answer_support_inquiry = () => ({ data: null, error: { code: '42501', message: 'x' } })
  const { container, cleanup } = await mount()
  try {
    const first = container.querySelectorAll('.admin-inquiry-card')[0]
    await act(async () => { button(first, '답변하기').click() })
    await type(first.querySelector('textarea'), '남아야 할 글')
    await act(async () => { button(first, '저장').click() })
    await flush()
    assert.deepEqual(toasts, ['관리자만 답변할 수 있습니다.'])
    const area = first.querySelector('textarea')
    assert.ok(area instanceof window.HTMLTextAreaElement)
    assert.equal(area.value, '남아야 할 글')
    assert.equal(countOf('rpc', 'admin_list_support_inquiries'), 1)
  } finally { await cleanup() }
})

test('한 번에 한 카드만 열린다, 고치기는 지금 답변이 채워진 채', async () => {
  serverSays(true)
  const { container, cleanup } = await mount()
  try {
    const [first, second] = container.querySelectorAll('.admin-inquiry-card')
    await act(async () => { button(first, '답변하기').click() })
    await act(async () => { button(second, '답변 수정').click() })
    assert.equal(container.querySelectorAll('textarea').length, 1)
    const area = second.querySelector('textarea')
    assert.ok(area instanceof window.HTMLTextAreaElement)
    assert.equal(area.value, '이미 답함')
    await act(async () => { button(second, '취소').click() })
    assert.equal(container.querySelectorAll('textarea').length, 0)
  } finally { await cleanup() }
})
