// 로드맵 7-C-2 — 기사 개인정보 화면의 "소속 연결" 카드: 세 가지 상태, 요청·취소는 연동 유지, 동의로 해제되면 내 계정으로 다시 불러온 뒤 화면 전환.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'
import { createFakeSupabase } from '../../testSupport/fakeSupabaseClient.js'

const { fakeSupabase, handlers, resetHandlers } = createFakeSupabase()
mock.module('../../supabaseClient.js', { namedExports: { supabase: fakeSupabase } })

/** @type {Array<string>} */
let flow = []
const NEXT_SESSION = { userId: 'driver-1', name: '기사', phone: '', accountType: 'owner_driver', linkedOwnerId: null, guestMode: false }
mock.module('../../app/boot.js', {
  namedExports: {
    buildCloudAppSession: async (/** @type {string} */ userId) => { flow.push(`session:${userId}`); return NEXT_SESSION },
    ownerKeyFromSession: (/** @type {{ userId: string }} */ session) => session.userId,
  },
})
mock.module('../../lib/hydrate.js', {
  namedExports: {
    hydrateFromSupabase: async (/** @type {string} */ userId, /** @type {string} */ ownerKey, /** @type {{ employedDriver: boolean }} */ options) => {
      flow.push(`hydrate:${userId}:${ownerKey}:${options.employedDriver}`)
    },
  },
})

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: EmployerLinkCard } = await import('./EmployerLinkCard.jsx')
const { commitDrivers } = await import('../../store/commitHelpers.js')
const { setHydration } = await import('../../store/app-store.js')
const { beginSessionEpoch } = await import('../../lib/cloudSession.js')

const OWNER = 'owner-1'
const DRIVER = 'driver-1'
const SESSION = { userId: DRIVER, name: '기사', phone: '', accountType: 'employed_driver', linkedOwnerId: OWNER, guestMode: false }
const REQUESTED_AT = '2026-10-01T03:00:00.000Z'

/** @param {Partial<import('../../lib/outboxTypes.js').DriverRecord>} extra */
function seedLink(extra = {}) {
  commitDrivers(OWNER, [{ id: 'd1', name: '기사', status: 'linked', vehicleNumber: '11가1111', supabaseId: 'link-1', ...extra }], { syncToCloud: false })
}

/** @param {string} status @param {string} requestedBy */
function rpcRow(status, requestedBy) {
  return () => ({ data: [{ id: 'link-1', status, unlink_requested_by: requestedBy || null, unlink_requested_at: requestedBy ? REQUESTED_AT : null }], error: null })
}

/** @returns {Promise<{ container: HTMLDivElement, unlinked: Array<object>, toasts: Array<string>, cleanup: () => Promise<void> }>} */
async function renderCard() {
  /** @type {Array<object>} */
  const unlinked = []
  /** @type {Array<string>} */
  const toasts = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(EmployerLinkCard, {
      ownerKey: OWNER, session: SESSION, showToast: (/** @type {string} */ msg) => { toasts.push(msg) }, onUnlinked: (/** @type {object} */ next) => { unlinked.push(next) },
    }))
  })
  return { container, unlinked, toasts, cleanup: async () => { await act(async () => { root.unmount() }); container.remove() } }
}

/** @param {HTMLDivElement} container @param {string} label */
async function click(container, label) {
  const button = [...container.querySelectorAll('button')].find((el) => el.textContent?.trim() === label)
  assert.ok(button instanceof window.HTMLButtonElement, `${label} 버튼이 있어야 한다`)
  await act(async () => { button.click() })
}

/** @param {HTMLDivElement} container */
function labels(container) {
  return [...container.querySelectorAll('button')].map((el) => el.textContent?.trim())
}

beforeEach(() => {
  resetHandlers()
  flow = []
  beginSessionEpoch(DRIVER, OWNER)
  setHydration({ status: 'ready', userId: DRIVER, ownerKey: OWNER })
})

test('요청 없음: 연동 정보 + [해제 요청] → 요청 후 "차주 동의 대기" + [요청 취소], 연동 유지·화면 전환 없음', async () => {
  seedLink()
  handlers.rpc = { request_driver_unlink: rpcRow('linked', DRIVER) }
  const view = await renderCard()
  try {
    assert.ok(view.container.textContent?.includes('소속 연결'))
    assert.ok(view.container.querySelector('section.employer-link-card'), '카드 글씨 모양용 클래스(7-D-2)')
    assert.ok(view.container.textContent?.includes('배정 차량 11가1111'))
    assert.deepEqual(labels(view.container), ['해제 요청'])
    await click(view.container, '해제 요청')
    assert.ok(view.container.textContent?.includes('해제 요청 중 — 차주 동의 대기 (10월 4일 자동 해제)'))
    assert.deepEqual(labels(view.container), ['요청 취소'])
    assert.deepEqual(view.unlinked, [])
    assert.deepEqual(flow, [])
  } finally {
    await view.cleanup()
  }
})

test('내 요청 [요청 취소] → 원래대로 [해제 요청]', async () => {
  seedLink({ unlinkRequestedBy: DRIVER, unlinkRequestedAt: REQUESTED_AT })
  handlers.rpc = { cancel_driver_unlink: rpcRow('linked', '') }
  const view = await renderCard()
  try {
    await click(view.container, '요청 취소')
    assert.deepEqual(labels(view.container), ['해제 요청'])
    assert.deepEqual(view.toasts, ['해제 요청을 취소했습니다.'])
    assert.deepEqual(view.unlinked, [])
  } finally {
    await view.cleanup()
  }
})

test('차주 요청 [동의] → 해제 확정: 내 계정 세션 재생성 → 내 계정으로 불러오기 → 화면 전환', async () => {
  seedLink({ unlinkRequestedBy: OWNER, unlinkRequestedAt: REQUESTED_AT })
  handlers.rpc = { consent_driver_unlink: rpcRow('disconnected', '') }
  const view = await renderCard()
  try {
    assert.ok(view.container.textContent?.includes('차주가 해제를 요청했습니다 (10월 4일 자동 해제)'))
    await click(view.container, '동의')
    assert.deepEqual(flow, [`session:${DRIVER}`, `hydrate:${DRIVER}:${DRIVER}:false`])
    assert.deepEqual(view.unlinked, [NEXT_SESSION])
    assert.deepEqual(view.toasts, ['연동을 해제했습니다.'])
  } finally {
    await view.cleanup()
  }
})

test('서버 함수 실패 → 실패 토스트, 화면 전환 없음', async () => {
  seedLink({ unlinkRequestedBy: OWNER, unlinkRequestedAt: REQUESTED_AT })
  handlers.rpc = { consent_driver_unlink: () => ({ data: null, error: { message: '서버 오류' } }) }
  const view = await renderCard()
  try {
    await click(view.container, '동의')
    assert.deepEqual(view.toasts, ['서버 오류'])
    assert.deepEqual(view.unlinked, [])
    assert.deepEqual(flow, [])
  } finally {
    await view.cleanup()
  }
})
