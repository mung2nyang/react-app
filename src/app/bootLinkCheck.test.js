// 로드맵 19 — 앱 켤 때 연동 확인이 실패하면 1번 더, 그래도 실패하면 본인 칸으로 들어가지 않고 안내 화면.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'
import { createFakeSupabase } from '../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers } = createFakeSupabase()
fakeSupabase.auth.getSession = async () => ({ data: { session: { user: { id: 'driver-1', user_metadata: { name: '기사' }, phone: null } } }, error: null })
mock.module('../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

/** @type {Array<{ userId: string, ownerKey: string, employedDriver: boolean }>} */
const hydrated = []
mock.module('../lib/hydrate.js', {
  namedExports: {
    hydrateFromSupabase: async (/** @type {string} */ userId, /** @type {string} */ ownerKey, /** @type {{ employedDriver?: boolean }} */ options = {}) => {
      hydrated.push({ userId, ownerKey, employedDriver: !!options.employedDriver })
    },
  },
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { restoreSessionOnBoot } = await import('./boot.js')

/** @type {Array<'fail' | 'linked' | 'none'>} */
let answers = []
let linkCalls = 0

beforeEach(() => {
  resetHandlers()
  hydrated.length = 0
  linkCalls = 0
  handlers.profiles = { select: () => ({ data: { id: 'driver-1', name: '기사', phone: '', account_type: 'owner_driver' }, error: null }) }
  handlers.rpc = { settle_expired_driver_unlinks: () => ({ data: 0, error: null }) }
  handlers.driver_links = {
    select: () => {
      const answer = answers[linkCalls] ?? answers[answers.length - 1]
      linkCalls += 1
      if (answer === 'fail') return { data: null, error: { message: '네트워크 오류' } }
      if (answer === 'linked') return { data: { id: 'link-1', owner_id: 'owner-1', status: 'linked' }, error: null }
      return { data: null, error: null }
    },
  }
})

test('1번 실패 → 재확인 성공(연동 있음) → 차주 칸으로 시작', async () => {
  answers = ['fail', 'linked']
  const restored = await restoreSessionOnBoot(5)
  assert.ok(restored && 'session' in restored)
  assert.equal(restored.session.linkedOwnerId, 'owner-1')
  assert.equal(linkCalls, 2)
  assert.deepEqual(hydrated, [{ userId: 'driver-1', ownerKey: 'owner-1', employedDriver: true }])
})

test('두 번 다 실패 → linkCheckFailed, 본인 칸으로 불러오기 안 함', async () => {
  answers = ['fail', 'fail']
  const restored = await restoreSessionOnBoot(5)
  assert.deepEqual(restored, { linkCheckFailed: true })
  assert.equal(linkCalls, 2)
  assert.deepEqual(hydrated, [], '어느 칸으로도 불러오지 않음')
})

test('확인 성공 + 연동 없음 → 지금처럼 본인 칸, 재확인 안 함', async () => {
  answers = ['none']
  const restored = await restoreSessionOnBoot(5)
  assert.ok(restored && 'session' in restored)
  assert.equal(restored.session.linkedOwnerId, null)
  assert.equal(linkCalls, 1)
  assert.deepEqual(hydrated, [{ userId: 'driver-1', ownerKey: 'driver-1', employedDriver: false }])
})

test('화면: 안내 화면 문구·다시 시도', async () => {
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { default: BootRetryScreen } = await import('../components/BootRetryScreen.jsx')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await React.act(async () => { root.render(React.createElement(BootRetryScreen)) })
    assert.ok(container.querySelector('[role="alert"]'))
    assert.equal(container.querySelector('h1')?.textContent, '네트워크 연결이 불안정합니다.')
    assert.equal(container.querySelector('p')?.textContent, '연결 상태를 확인해 주세요.')
    assert.equal(container.querySelector('button')?.textContent, '다시 시도')
  } finally {
    await React.act(async () => { root.unmount() })
    container.remove()
  }
})
