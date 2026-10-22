// 로드맵 24-B-1 — 운비서 카드: 누르면 늘어남, 줄 마이크 한 번에 듣기, 글로 보내기 → 내가 한 말·결과 글, 비회원은 안 부름.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { withSession } = await import('../../../testSupport/withSession.js')
const { supabase } = await import('../../../data/cloud/supabaseClient.ts')
const { commitClients } = await import('../../../data/store/commitHelpers.ts')
const { todayWorkLogSelection } = await import('../../../domain/calendar.ts')
const { default: HomeAssistantBar } = await import('./HomeAssistantBar.jsx')

const calls = []
let reply = async () => ({ data: null, error: null })
supabase.functions = { invoke: async (name, options) => { calls.push({ name, body: options.body }); return reply() } }
beforeEach(() => { calls.length = 0; reply = async () => ({ data: null, error: null }) })

const CLOUD = { userId: 'u-assistant', name: '보리', accountType: 'owner' }

async function mount(ownerKey, session, { open = true } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(withSession(React.createElement(HomeAssistantBar), { ownerKey, session })) })
  if (open) {
    const toggle = container.querySelector('.home-assistant-toggle')
    await act(async () => { toggle.click() })
  }
  return {
    container,
    async type(text) {
      const input = container.querySelector('.home-assistant-input')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      await act(async () => { setter.call(input, text); input.dispatchEvent(new window.Event('input', { bubbles: true })) })
    },
    async send() {
      await act(async () => { container.querySelector('.home-assistant-send').click() })
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    },
    async cleanup() { await act(async () => { root.unmount() }); container.remove() },
  }
}

test('비회원: 늘어나면 로그인 안내만, 서버를 부르지 않는다', async () => {
  const view = await mount('guest', null)
  try {
    assert.equal(view.container.querySelector('.home-assistant-toggle').getAttribute('aria-expanded'), 'true')
    assert.equal(view.container.querySelector('.home-assistant-note')?.textContent, '로그인하면 쓸 수 있습니다.')
    assert.equal(view.container.querySelector('.home-assistant-input'), null)
    assert.equal(calls.length, 0)
  } finally { await view.cleanup() }
})

test('로그인: 받아쓰기 없는 브라우저면 마이크 버튼 없이 글 칸, 빈 칸은 못 보냄', async () => {
  const view = await mount('u-assistant', CLOUD)
  try {
    assert.equal(view.container.querySelector('.home-assistant-mic-btn'), null)
    assert.ok(view.container.querySelector('.home-assistant-send').disabled)
  } finally { await view.cleanup() }
})

test('글로 보내기: 거래처 이름·오늘을 같이 보내고, 내가 한 말과 운행 결과 문장을 보인다', async () => {
  commitClients('u-assistant', [{ id: 'c1', companyName: '한진' }, { id: 'c2', companyName: '롯데' }])
  reply = async () => ({ data: { kind: 'call', call: { date: '2026-10-21', loadLoc: '수원', unloadLoc: '화성', fare: 150000, client: '' } }, error: null })
  const view = await mount('u-assistant', CLOUD)
  try {
    await view.type('어제 수원 화성 15만')
    await view.send()
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0], { name: 'unbiseo-parse', body: { text: '어제 수원 화성 15만', today: todayWorkLogSelection(new Date()).dateKey, clientNames: ['한진', '롯데'] } })
    assert.equal(view.container.querySelector('.home-assistant-said')?.textContent, '내가 한 말: 어제 수원 화성 15만')
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '10월 21일 수원 → 화성, 150,000원으로 기록할게요.')
  } finally { await view.cleanup() }
})

test('보내는 동안 다시 보내기·글 칸이 잠기고, 지출·실패는 정해진 문구', async () => {
  let release = () => {}
  reply = () => new Promise((resolve) => { release = () => resolve({ data: { kind: 'expense' }, error: null }) })
  const view = await mount('u-assistant', CLOUD)
  try {
    await view.type('주유 8만원')
    await act(async () => { view.container.querySelector('.home-assistant-send').click() })
    assert.ok(view.container.querySelector('.home-assistant-send').disabled)
    assert.ok(view.container.querySelector('.home-assistant-input').disabled)
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '알아듣는 중…')
    await act(async () => { release(); await new Promise((resolve) => setTimeout(resolve, 0)) })
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '지출 기록은 곧 할 수 있게 됩니다.')
    reply = async () => { throw new Error('network') }
    await view.send()
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '잠시 뒤 다시 시도해 주세요.')
  } finally { await view.cleanup() }
})

test('줄을 다시 누르면 접힌다', async () => {
  const view = await mount('u-assistant', CLOUD)
  try {
    await act(async () => { view.container.querySelector('.home-assistant-toggle').click() })
    assert.equal(view.container.querySelector('.home-assistant-panel'), null)
    assert.equal(view.container.querySelector('.home-assistant-toggle').getAttribute('aria-expanded'), 'false')
  } finally { await view.cleanup() }
})

test('받아쓰기 되는 브라우저: 줄의 마이크 하나 — 접힌 채 한 번 누르면 늘어나며 바로 듣기, 말이 끝나면 글 칸에 넣고 바로 보냄, 권한 거절 문구', async () => {
  let last = null
  class FakeRecognizer {
    constructor() { last = this; this.started = false }
    start() { this.started = true }
    stop() { this.onend?.() }
    abort() {}
  }
  window.webkitSpeechRecognition = FakeRecognizer
  reply = async () => ({ data: { kind: 'expense' }, error: null })
  const view = await mount('u-assistant', CLOUD, { open: false })
  try {
    assert.equal(view.container.querySelectorAll('.home-assistant-mic-btn').length, 1, '마이크 버튼은 하나')
    const mic = view.container.querySelector('.home-assistant-head .home-assistant-mic-btn')
    assert.ok(mic, '마이크는 줄 오른쪽')
    assert.equal(view.container.querySelector('.home-assistant-panel'), null, '처음엔 접힘')
    await act(async () => { mic.click() })
    assert.equal(view.container.querySelector('.home-assistant-toggle').getAttribute('aria-expanded'), 'true', '한 번에 늘어남')
    assert.ok(mic.classList.contains('listening'))
    assert.equal(view.container.querySelectorAll('.home-assistant-mic-btn').length, 1, '늘어나도 마이크는 하나')
    assert.equal(last.lang, 'ko-KR')
    assert.ok(last.started)
    assert.equal(view.container.querySelector('.home-assistant-note')?.textContent, '듣는 중…')
    await act(async () => {
      last.onresult({ results: [[{ transcript: '주유 8만원' }]] })
      last.onend()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    assert.equal(view.container.querySelector('.home-assistant-input').value, '주유 8만원')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].body.text, '주유 8만원')
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '지출 기록은 곧 할 수 있게 됩니다.')
    await act(async () => { view.container.querySelector('.home-assistant-mic-btn').click() })
    await act(async () => { last.onerror({ error: 'not-allowed' }); last.onend() })
    assert.equal(view.container.querySelector('.home-assistant-note')?.textContent, '마이크 권한을 켜 주세요. 글로 써도 됩니다.')
    assert.equal(calls.length, 1, '받아쓴 말이 없으면 안 보냄')
  } finally {
    await view.cleanup()
    delete window.webkitSpeechRecognition
  }
})

test('비회원이 줄 마이크를 누르면 카드만 열려 로그인 안내, 듣지 않음', async () => {
  let started = 0
  window.webkitSpeechRecognition = class { start() { started += 1 } stop() {} abort() {} }
  const view = await mount('guest', null, { open: false })
  try {
    await act(async () => { view.container.querySelector('.home-assistant-mic-btn').click() })
    assert.equal(view.container.querySelector('.home-assistant-note')?.textContent, '로그인하면 쓸 수 있습니다.')
    assert.equal(started, 0)
  } finally {
    await view.cleanup()
    delete window.webkitSpeechRecognition
  }
})
