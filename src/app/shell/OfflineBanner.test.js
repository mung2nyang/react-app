// 로드맵 84 — 로그인 계정이 쓰는 중 인터넷이 끊기면 맨 위 빨간 띠, 다시 연결되면 사라짐. 비회원은 안 보임.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: OfflineBanner } = await import('./OfflineBanner.jsx')

const LOGGED_IN = { userId: 'user-1', name: '차주' }
const GUEST = { name: '비회원', accountType: 'owner_driver', guestMode: true }

let onLine = true
Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, get: () => onLine })

/** @param {boolean} value */
async function setOnline(value) {
  onLine = value
  await act(async () => { window.dispatchEvent(new window.Event(value ? 'online' : 'offline')) })
}

/** @param {object} session */
async function mount(session) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(OfflineBanner, { session })) })
  return {
    container,
    async unmount() {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

test('로그인 계정 + 끊긴 채 들어옴 → 띠·두 줄·바로 읽어 줌(role="alert")', async () => {
  onLine = false
  const view = await mount(LOGGED_IN)
  try {
    const banner = view.container.querySelector('.offline-banner')
    assert.equal(banner?.getAttribute('role'), 'alert')
    assert.ok(banner?.querySelector('svg'))
    const lines = [...(banner?.querySelectorAll('.offline-banner-line') ?? [])].map((line) => line.textContent?.trim())
    assert.deepEqual(lines, ['인터넷 연결이 끊겼습니다.', '다시 연결되기 전에는 저장되지 않습니다.'])
  } finally {
    await view.unmount()
    onLine = true
  }
})

test('쓰는 중 끊기면 띠가 생기고, 다시 연결되면 사라진다', async () => {
  onLine = true
  const view = await mount(LOGGED_IN)
  try {
    assert.equal(view.container.querySelector('.offline-banner'), null)
    await setOnline(false)
    assert.ok(view.container.querySelector('.offline-banner'))
    await setOnline(true)
    assert.equal(view.container.querySelector('.offline-banner'), null)
  } finally {
    await view.unmount()
    onLine = true
  }
})

test('로그인 계정 + 연결됨 → 띠 없음', async () => {
  onLine = true
  const view = await mount(LOGGED_IN)
  try {
    assert.equal(view.container.querySelector('.offline-banner'), null)
  } finally {
    await view.unmount()
  }
})

test('비회원 + 끊김 → 띠 없음(휴대폰에 저장돼서)', async () => {
  onLine = false
  const view = await mount(GUEST)
  try {
    assert.equal(view.container.querySelector('.offline-banner'), null)
    await setOnline(false)
    assert.equal(view.container.querySelector('.offline-banner'), null)
  } finally {
    await view.unmount()
    onLine = true
  }
})
