// 개인정보 화면 입력 — 글자는 즉시 보이고 저장은 묶어서 한 번에(로그인 상태의 느린 서버 저장에도 글자가 안 사라짐).
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import { resetStubSupabaseCallCounts, stubSupabaseCallCounts, stubSupabaseMethodImpls } from '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: PersonalInfoPage } = await import('./PersonalInfoPage.jsx')
const { commitProfile } = await import('../store/commitHelpers.js')
const { getState, setHydration } = await import('../store/app-store.js')
const { beginSessionEpoch, endCloudSession } = await import('../lib/cloudSession.js')
const { EMPTY_PROFILE } = await import('../lib/profile.js')

const SERVER_DELAY_MS = 150

/** @param {number} ms */
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }
/** @param {number} ms */
async function wait(ms) { await act(async () => { await sleep(ms) }) }

/** @param {ParentNode} container @param {string} selector */
function input(container, selector) {
  const el = container.querySelector(selector)
  assert.ok(el, selector)
  return /** @type {HTMLInputElement} */ (el)
}

/** React 제어 입력에 값을 넣고 input 이벤트를 보낸다. @param {HTMLInputElement} el @param {string} value */
async function typeInto(el, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set
  assert.ok(setter)
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

/** @param {HTMLInputElement} el */
async function blur(el) {
  await act(async () => {
    el.focus()
    el.blur()
  })
}

/** @param {string} owner @param {'cloud'|'guest'} mode */
function setup(owner, mode) {
  resetStubSupabaseCallCounts()
  stubSupabaseMethodImpls.upsert = () => new Promise((resolve) => {
    setTimeout(() => resolve({ data: null, error: null }), SERVER_DELAY_MS)
  })
  if (mode === 'cloud') {
    beginSessionEpoch(`user-${owner}`, owner)
    setHydration({ status: 'ready', userId: `user-${owner}`, ownerKey: owner })
  } else {
    endCloudSession()
  }
  commitProfile(owner, { ...EMPTY_PROFILE, bizName: '기존상호', bizItem: '기존종목' }, { syncToCloud: false })
}

/** @param {string} owner @param {Array<string>} [toasts] */
async function mount(owner, toasts = []) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(PersonalInfoPage, {
      ownerKey: owner, session: null, onBack: () => {}, showToast: (/** @type {string} */ message) => toasts.push(message),
    }))
  })
  return {
    container,
    async unmount() {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

/** @param {string} owner */
const stored = (owner) => getState().profile[owner]

test('로그인+느린 서버: 빠르게 여러 번 쳐도 글자가 즉시 남고, 멈추면 마지막 값으로 서버 저장 1회', async () => {
  const owner = 'typing-cloud-fast'
  setup(owner, 'cloud')
  const { container, unmount } = await mount(owner)
  try {
    const el = input(container, '#bizName')
    for (const value of ['새', '새상', '새상호']) {
      await typeInto(el, value)
      assert.equal(el.value, value, '친 글자가 바로 보여야 한다')
    }
    assert.equal(stubSupabaseCallCounts.upsert, 0, '입력 중에는 서버 저장을 안 한다')
    await wait(700 + SERVER_DELAY_MS + 250)
    assert.equal(stubSupabaseCallCounts.upsert, 1)
    assert.equal(stored(owner)?.bizName, '새상호')
    assert.equal(el.value, '새상호')
  } finally { await unmount(); endCloudSession() }
})

test('칸을 벗어나면 0.7초를 안 기다리고 바로 저장한다', async () => {
  const owner = 'typing-cloud-blur'
  setup(owner, 'cloud')
  const { container, unmount } = await mount(owner)
  try {
    const el = input(container, '#bizName')
    await typeInto(el, '즉시저장')
    await blur(el)
    await wait(SERVER_DELAY_MS + 100)
    assert.equal(stubSupabaseCallCounts.upsert, 1)
    assert.equal(stored(owner)?.bizName, '즉시저장')
  } finally { await unmount(); endCloudSession() }
})

test('저장이 진행 중일 때 더 치면 끝난 뒤 최신 값으로 한 번 더 저장하고 화면 값은 계속 유지된다', async () => {
  const owner = 'typing-cloud-overlap'
  setup(owner, 'cloud')
  const { container, unmount } = await mount(owner)
  try {
    const el = input(container, '#bizName')
    await typeInto(el, '첫값')
    await blur(el)
    await typeInto(el, '첫값추가')
    assert.equal(el.value, '첫값추가')
    await blur(el)
    await wait(SERVER_DELAY_MS * 2 + 250)
    assert.equal(stubSupabaseCallCounts.upsert, 2)
    assert.equal(stored(owner)?.bizName, '첫값추가')
    assert.equal(el.value, '첫값추가')
  } finally { await unmount(); endCloudSession() }
})

test('화면을 나가면 남은 입력을 저장한다', async () => {
  const owner = 'typing-cloud-unmount'
  setup(owner, 'cloud')
  const { container, unmount } = await mount(owner)
  await typeInto(input(container, '#bizAddress'), '서울시 강서구 1')
  await unmount()
  await sleep(SERVER_DELAY_MS + 100)
  try {
    assert.equal(stubSupabaseCallCounts.upsert, 1)
    assert.equal(stored(owner)?.bizAddress, '서울시 강서구 1')
  } finally { endCloudSession() }
})

test('서버 실패(throw·{data:null,error})면 토스트, 입력칸은 저장 값으로 복귀, Store 불변', async () => {
  const errSpy = mock.method(console, 'error', () => {})
  try {
    for (const [label, impl] of /** @type {const} */ ([
      ['throw', async () => { throw new Error('network down') }],
      ['error', async () => ({ data: null, error: { message: 'RLS' } })],
    ])) {
      const owner = `typing-cloud-fail-${label}`
      setup(owner, 'cloud')
      stubSupabaseMethodImpls.upsert = impl
      const toasts = /** @type {Array<string>} */ ([])
      const { container, unmount } = await mount(owner, toasts)
      try {
        const el = input(container, '#bizName')
        await typeInto(el, '실패할값')
        await blur(el)
        await wait(100)
        assert.deepEqual(toasts, ['저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'], label)
        assert.equal(el.value, '기존상호', label)
        assert.equal(stored(owner)?.bizName, '기존상호', label)
      } finally { await unmount(); endCloudSession() }
    }
  } finally { errSpy.mock.restore() }
})

test('치고 있지 않은 칸은 외부 프로필 변경을 따라가고, 치는 칸은 입력이 우선이다', async () => {
  const owner = 'typing-external'
  setup(owner, 'guest')
  const { container, unmount } = await mount(owner)
  try {
    await typeInto(input(container, '#bizName'), '내가치는값')
    await act(async () => {
      commitProfile(owner, { ...EMPTY_PROFILE, bizName: '외부상호', bizItem: '외부종목' }, { syncToCloud: false })
    })
    assert.equal(input(container, '#bizItem').value, '외부종목')
    assert.equal(input(container, '#bizName').value, '내가치는값')
    await blur(input(container, '#bizName'))
    await wait(50)
  } finally { await unmount() }
})

test('게스트도 글자가 사라지지 않고 저장되며 서버 호출은 없다. 연락처는 하이픈 서식', async () => {
  const owner = 'typing-guest'
  setup(owner, 'guest')
  const { container, unmount } = await mount(owner)
  try {
    const el = input(container, '#bizName')
    for (const value of ['가', '가나', '가나다']) {
      await typeInto(el, value)
      assert.equal(el.value, value)
    }
    await typeInto(input(container, '#userPhone'), '01012345678')
    assert.equal(input(container, '#userPhone').value, '010-1234-5678')
    await blur(el)
    await wait(50)
    assert.equal(stored(owner)?.bizName, '가나다')
    assert.equal(stored(owner)?.phone, '010-1234-5678')
    assert.equal(stubSupabaseCallCounts.upsert, 0)
  } finally { await unmount() }
})
