// @ts-check
// 로드맵 23-C — 알림 화면의 문의 알림: 비회원은 서버 안 부름, 답변 도착·관리자 새 문의, 서버 오류면 문의 알림만 빠짐, 계정 바뀜, 스위치.
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
const { act } = React
const { withSession } = await import('../../../testSupport/withSession.js')
const { default: NotificationsPage } = await import('../ui/NotificationsPage.jsx')

const ANSWER_AT = '2026-10-22T03:00:00Z'

beforeEach(() => {
  resetHandlers()
  handlers.support_inquiries = {
    select: () => ({ data: [{ id: 'q-1', title: '첫 문의', answer: '답', answered_at: ANSWER_AT }], error: null }),
  }
  handlers.rpc = {
    is_admin: () => ({ data: false, error: null }),
    admin_list_support_inquiries: () => ({ data: [{ id: 'n-1', title: '새 문의', answer: null }, { id: 'n-0', title: '옛', answer: null }], error: null }),
  }
})

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

/** @param {string} userId */
const cloud = (userId) => ({ session: { userId, name: '기사', accountType: 'owner' }, ownerKey: userId })

/** @param {{ session: import('../../../data/sync/syncTypes.ts').AppSession, ownerKey: string }} value */
async function mount(value) {
  /** @type {Array<string>} */
  const opened = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  /** @param {{ session: import('../../../data/sync/syncTypes.ts').AppSession, ownerKey: string }} next */
  const render = async (next) => {
    await act(async () => {
      root.render(withSession(React.createElement(NotificationsPage, { onBack: () => {}, onOpenPage: (/** @type {string} */ page) => { opened.push(page) } }), next))
    })
    await flush()
    await flush()
  }
  await render(value)
  return {
    container, opened, render,
    titles: () => [...container.querySelectorAll('.notif-item strong')].map((el) => el.textContent),
    switches: () => [...container.querySelectorAll('.notif-settings-row label[for]')].map((el) => el.getAttribute('for')),
    cleanup: async () => { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('비회원은 서버를 안 부르고 문의 알림·스위치가 없다', async () => {
  const view = await mount({ session: { guestMode: true, name: '비회원' }, ownerKey: 'guest' })
  try {
    assert.equal(countOf('support_inquiries', 'select'), 0)
    assert.equal(countOf('rpc', 'is_admin'), 0)
    assert.equal(view.titles().includes('문의에 답변이 도착했습니다'), false)
    assert.equal(view.switches().includes('notif-inquiryAnswer'), false)
  } finally { await view.cleanup() }
})

test('일반 계정: 답변 도착이 맨 뒤에, 누르면 my-inquiries, [닫기]로 사라짐, "새 문의" 스위치 없음', async () => {
  const view = await mount(cloud('u-plain'))
  try {
    assert.equal(view.titles().at(-1), '문의에 답변이 도착했습니다')
    assert.equal(view.titles().some((title) => title?.startsWith('답변 대기 문의')), false)
    assert.equal(countOf('rpc', 'admin_list_support_inquiries'), 0)
    assert.ok(view.switches().includes('notif-inquiryAnswer'))
    assert.equal(view.switches().includes('notif-adminInquiry'), false)
    const item = [...view.container.querySelectorAll('.notif-item')].find((el) => el.textContent?.includes('첫 문의'))
    assert.ok(item)
    const open = item.querySelector('.notif-item-copy')
    assert.ok(open instanceof window.HTMLElement)
    await act(async () => { open.click() })
    assert.deepEqual(view.opened, ['my-inquiries'])
    const close = item.querySelector('.notif-action-dismiss')
    assert.ok(close instanceof window.HTMLElement)
    await act(async () => { close.click() })
    assert.equal(view.titles().includes('문의에 답변이 도착했습니다'), false)
  } finally { await view.cleanup() }
})

test('관리자 계정: "답변 대기 문의 2건"·"새 문의" 스위치', async () => {
  handlers.rpc.is_admin = () => ({ data: true, error: null })
  const view = await mount(cloud('u-admin'))
  try {
    assert.ok(view.titles().includes('답변 대기 문의 2건'))
    assert.ok(view.switches().includes('notif-adminInquiry'))
  } finally { await view.cleanup() }
})

test('서버 오류면 문의 알림만 빠지고 다른 알림은 그대로', async () => {
  handlers.support_inquiries = { select: () => ({ data: null, error: { message: 'x' } }) }
  const view = await mount(cloud('u-fail'))
  try {
    assert.ok(view.titles().includes('일상점검표가 의무화되었습니다'))
    assert.equal(view.titles().includes('문의에 답변이 도착했습니다'), false)
  } finally { await view.cleanup() }
})

test('계정이 바뀌면 새 답을 받기 전까지 이전 계정 문의 알림은 안 보인다', async () => {
  const view = await mount(cloud('u-a'))
  try {
    assert.ok(view.titles().includes('문의에 답변이 도착했습니다'))
    handlers.support_inquiries = { select: () => new Promise(() => {}) }
    await view.render(cloud('u-b'))
    assert.equal(view.titles().includes('문의에 답변이 도착했습니다'), false)
  } finally { await view.cleanup() }
})
