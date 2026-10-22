// 로드맵 23-B — 마이페이지 "관리자" 줄: 관리자면 "고객센터" 다음에 보이고 admin으로, 아니면 없음, 비회원은 서버를 안 부름.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'
import { createFakeSupabase } from '../../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers, countOf } = createFakeSupabase()
mock.module('../../../data/cloud/supabaseClient.ts', { namedExports: { supabase: fakeSupabase } })

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { withSession } = await import('../../../testSupport/withSession.js')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: MyPage } = await import('./MyPage.jsx')

const CLOUD = { userId: 'u-1', name: '보리', phone: '', accountType: 'owner' }

beforeEach(() => { resetHandlers() })

/** @param {import('../../../data/sync/syncTypes.ts').AppSession} session */
async function mount(session) {
  const opened = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(withSession(React.createElement(MyPage, { onOpen: (page) => { opened.push(page) } }), { session, ownerKey: 'admin-entry-test' }))
  })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  const labels = [...container.querySelectorAll('.mypage-notice-link')].map((el) => el.textContent.trim())
  return {
    container, labels, opened,
    cleanup: async () => { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('관리자면 "고객센터" 다음 "관리자", 누르면 admin으로', async () => {
  handlers.rpc = { is_admin: () => ({ data: true, error: null }) }
  const view = await mount(CLOUD)
  try {
    assert.equal(view.labels.at(-1), '관리자')
    assert.equal(view.labels.at(-2), '고객센터')
    const entry = [...view.container.querySelectorAll('.mypage-notice-link')].find((el) => el.textContent.trim() === '관리자')
    await act(async () => { entry.click() })
    assert.deepEqual(view.opened, ['admin'])
  } finally { await view.cleanup() }
})

test('관리자가 아니거나 서버 오류면 "관리자"가 없다', async () => {
  for (const answer of [{ data: false, error: null }, { data: null, error: { message: 'x' } }, { data: 'true', error: null }]) {
    handlers.rpc = { is_admin: () => answer }
    const view = await mount(CLOUD)
    try {
      assert.equal(view.labels.includes('관리자'), false)
    } finally { await view.cleanup() }
  }
})

test('비회원이면 서버를 안 부르고 "관리자"가 없다', async () => {
  const view = await mount({ guestMode: true, name: '비회원' })
  try {
    assert.equal(view.labels.includes('관리자'), false)
    assert.equal(countOf('rpc', 'is_admin'), 0)
  } finally { await view.cleanup() }
})
