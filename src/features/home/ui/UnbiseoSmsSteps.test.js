// 로드맵 24-H-2 — 운비서 미수금 문자 되묻기: 빠진 것만 차례로 묻고, 숫자는 미수금 화면과 같고, 다 고르면 [문자 열기] 주소.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { before, beforeEach, test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { withSession } = await import('../../../testSupport/withSession.js')
const { supabase } = await import('../../../data/cloud/supabaseClient.ts')
const { commitCars, commitClients, commitLogWorkData, commitSettings } = await import('../../../data/store/commitHelpers.ts')
const { normalizeSettings } = await import('../../../domain/practiceSettings.ts')
const { buildSmsHref } = await import('../../../domain/smsHref.ts')
const { FIXTURE_SETTINGS, FIXTURE_WORK } = await import('../../../domain/finance.fixtures.ts')
const { default: HomeAssistantBar } = await import('./HomeAssistantBar.jsx')
const { UnbiseoProvider } = await import('../hooks/unbiseoContext.ts')

const OWNER = 'u-sms-steps'
const CLOUD = { userId: OWNER, name: '보리', accountType: 'owner' }
let reply = async () => ({ data: null, error: null })
/** @type {Array<string>} */
const calls = []
supabase.functions = { invoke: async (/** @type {string} */ name) => { calls.push(name); return reply() } }
beforeEach(() => { localStorage.removeItem('messageTemplateCustomBodies') })

before(() => {
  commitSettings(OWNER, normalizeSettings({ fixedOn: true, subFixedOn: true }))
  commitClients(OWNER, [...FIXTURE_SETTINGS.clients, { id: 'c-daehan', companyName: '대한', phone: '010-2222-3333' }])
  commitCars(OWNER, FIXTURE_SETTINGS.cars)
  Object.entries(FIXTURE_WORK).forEach(([logId, data]) => commitLogWorkData(OWNER, logId, data))
})

/** @param {object} sms */
async function ask(sms) {
  reply = async () => ({ data: { kind: 'sms', sms: { client: '', month: '', all: false, template: null, ...sms } }, error: null })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(withSession(React.createElement(UnbiseoProvider, { onOpenCall: () => {} }, React.createElement(HomeAssistantBar)), { ownerKey: OWNER, session: CLOUD })) })
  await act(async () => { container.querySelector('.home-assistant-toggle').click() })
  const input = container.querySelector('.home-assistant-input')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const type = async (/** @type {string} */ words) => {
    await act(async () => { setter.call(input, words); input.dispatchEvent(new window.Event('input', { bubbles: true })) })
    await act(async () => { container.querySelector('.home-assistant-send').click() })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  }
  await type('미수금 문자 보내줘')
  const choices = () => [...container.querySelectorAll('.unbiseo-sms-choice')].map((el) => el.textContent)
  const notes = () => [...container.querySelectorAll('.unbiseo-sms-step .home-assistant-note')].map((el) => el.textContent)
  const press = async (/** @type {string} */ label) => {
    const el = [...container.querySelectorAll('button')].find((button) => button.textContent === label)
    assert.ok(el, label)
    await act(async () => { el.click() })
  }
  const open = () => container.querySelector('.unbiseo-sms-open')
  return { container, input, type, choices, notes, press, open, async cleanup() { await act(async () => { root.unmount() }); container.remove() } }
}

test('아무것도 안 말하면: 거래처(남은 금액 큰 순) → 어떤 건(달별·남은 전체·직접 고르기) → 문구 → [문자 열기]', async () => {
  const view = await ask({})
  try {
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '미수금 문자를 보낼게요.')
    assert.ok(view.notes().includes('어느 거래처에 보낼까요?'))
    assert.deepEqual(view.choices(), ['대한(2건, 1,199,999원)', '한진(3건, 130,000원)', '직접(1건, 80,000원)'])
    await view.press('대한(2건, 1,199,999원)')
    assert.ok(view.notes().includes('어떤 건으로 문자를 보낼까요?'))
    assert.deepEqual(view.choices(), ['4월분 전체(1건, 999,999원)', '5월분 전체(1건, 200,000원)', '남은 전체(2건, 1,199,999원)', '직접 고르기'])
    await view.press('5월분 전체(1건, 200,000원)')
    assert.ok(view.notes().includes('어떤 문구로 보낼까요?'))
    assert.deepEqual(view.choices(), ['미수금 안내', '입금 요청', '운행 완료'])
    await view.press('미수금 안내')
    assert.equal(view.notes()[0], '대한(2건, 1,199,999원) · 5월분 전체(1건, 200,000원) · 미수금 안내', '고른 단계가 글로 남음')
    assert.ok(view.notes().includes('대한(010-2222-3333)에 이 문구로 보낼게요.'))
    const body = '안녕하세요, 대한 담당자님. 5월분 1건 운송료 200,000원이 미수 상태입니다. 확인 부탁드립니다.'
    assert.equal(view.container.querySelector('.unbiseo-sms-body')?.textContent, body)
    assert.equal(view.open()?.getAttribute('href'), buildSmsHref('010-2222-3333', body, navigator.userAgent))
  } finally { await view.cleanup() }
})

test('다 말하면 묻지 않고 바로 마지막, 연락처가 없으면 버튼 없이 알림', async () => {
  const view = await ask({ client: '대한', all: true, template: 2 })
  try {
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '대한에 미수금 문자를 보낼게요.')
    assert.deepEqual(view.choices(), [])
    assert.ok(view.open())
    assert.equal(view.container.querySelector('.unbiseo-sms-body')?.textContent, '안녕하세요. 전체 2건 운송 건 운송료 1,199,999원 입금 부탁드립니다. 감사합니다.')
  } finally { await view.cleanup() }
  const noPhone = await ask({ client: '한진', month: '2026-05', template: 1 })
  try {
    assert.ok(noPhone.notes().includes('한진에 등록된 연락처가 없어요. 거래처 화면에서 넣어 주세요.'))
    assert.equal(noPhone.open(), null)
  } finally { await noPhone.cleanup() }
})

test('말한 달에 남은 게 없으면 알리고 묻기, 남은 게 없는 거래처는 끝', async () => {
  const view = await ask({ client: '대한', month: '2026-07' })
  try {
    assert.ok(view.notes().includes('7월분은 남은 미수금이 없어요.'))
    assert.ok(view.notes().includes('어떤 건으로 문자를 보낼까요?'))
  } finally { await view.cleanup() }
  const none = await ask({ client: '롯데' })
  try {
    assert.equal(none.container.querySelector('.home-assistant-answer .home-assistant-note:last-child')?.textContent, '롯데는 남은 미수금이 없어요.')
  } finally { await none.cleanup() }
})

test('직접 고르기: 건마다 체크, 하나 이상 골라야 [다음], 고른 건으로 문구', async () => {
  const view = await ask({ client: '대한', template: 1 })
  try {
    await view.press('직접 고르기')
    const checks = [...view.container.querySelectorAll('.unbiseo-sms-check')]
    assert.deepEqual(checks.map((el) => el.textContent), ['4월 1일 상차지 → 하차지 999,999원', '5월 12일 상차지 → 하차지 200,000원'])
    const next = [...view.container.querySelectorAll('button')].find((el) => el.textContent === '다음')
    assert.equal(next?.disabled, true)
    await act(async () => { checks[1].querySelector('input').click() })
    assert.equal(next?.disabled, false)
    await view.press('다음')
    assert.equal(view.container.querySelector('.unbiseo-sms-body')?.textContent, '안녕하세요, 대한 담당자님. 5월 12일 상차지 → 하차지 운송료 200,000원이 미수 상태입니다. 확인 부탁드립니다.')
  } finally { await view.cleanup() }
})

// 로드맵 24-H-3 — 묻는 중에 말·글이 지금 보이는 버튼 하나와 맞으면 그 버튼을 누른 것과 같다(서버를 부르지 않음).
test('말로 고르기: 거래처 → 달 → 문구 번호, 서버는 처음 한 번만, 내가 한 말은 첫 말, 글 칸은 비움', async () => {
  const view = await ask({})
  const start = calls.length
  try {
    await view.type('대한에 보내줘')
    assert.ok(view.notes().includes('어떤 건으로 문자를 보낼까요?'))
    assert.equal(view.input.value, '', '맞으면 글 칸을 비움')
    await view.type('5월분')
    assert.ok(view.notes().includes('어떤 문구로 보낼까요?'))
    await view.type('1번')
    assert.equal(view.notes()[0], '대한(2건, 1,199,999원) · 5월분 전체(1건, 200,000원) · 미수금 안내')
    assert.ok(view.open())
    assert.equal(calls.length, start, '고르는 동안 서버를 부르지 않음')
    assert.equal(view.container.querySelector('.home-assistant-said')?.textContent, '내가 한 말: 미수금 문자 보내줘')
    reply = async () => ({ data: null, error: { message: 'x' } })
    await view.type('문자 열어')
    assert.equal(calls.length, start + 1, '마지막 단계에서는 [문자 열기]를 말로 열지 않고 서버로')
    assert.equal(view.open(), null)
  } finally { await view.cleanup() }
})

test('말로 고르기: 전체·직접, 체크 목록에서는 서버로, 안 맞거나 둘이 맞으면 서버로', async () => {
  const all = await ask({ client: '대한' })
  try {
    await all.type('남은 거 다')
    assert.ok(all.notes()[0].includes('남은 전체(2건, 1,199,999원)'))
  } finally { await all.cleanup() }
  const direct = await ask({ client: '대한' })
  const start = calls.length
  try {
    await direct.type('직접 고를게')
    assert.equal(direct.container.querySelectorAll('.unbiseo-sms-check').length, 2)
    assert.equal(calls.length, start)
    await direct.type('4월분')
    assert.equal(calls.length, start + 1, '체크 목록은 말로 고르지 않음')
  } finally { await direct.cleanup() }
  const none = await ask({})
  const before = calls.length
  try {
    await none.type('대한 한진')
    assert.equal(calls.length, before + 1, '둘이 맞으면 서버로')
    reply = async () => ({ data: null, error: { message: 'x' } })
    await none.type('어제 수원 화성 15만')
    assert.equal(calls.length, before + 2, '안 맞으면 서버로')
    assert.deepEqual(none.choices(), [], '새 답이 오면 되묻기 카드가 사라짐')
    assert.equal(none.container.querySelector('.home-assistant-said')?.textContent, '내가 한 말: 어제 수원 화성 15만')
  } finally { await none.cleanup() }
})

test('마이크로 골랐을 때만 다음 질문을 읽는다 — 마지막은 [문자 열기]를 눌러 달라고', async () => {
  let last = null
  window.webkitSpeechRecognition = class { constructor() { last = this } start() {} stop() { this.onend?.() } abort() {} }
  const synth = { spoken: [], speak(/** @type {{ text: string }} */ utterance) { this.spoken.push(utterance.text) }, cancel() {} }
  window.speechSynthesis = synth
  window.SpeechSynthesisUtterance = class { constructor(/** @type {string} */ text) { this.text = text } }
  const typed = await ask({ client: '대한' })
  try {
    assert.deepEqual(synth.spoken, [], '글로 보낸 첫 답은 읽지 않음')
    await typed.type('5월분')
    assert.ok(typed.notes().includes('어떤 문구로 보낼까요?'))
    assert.deepEqual(synth.spoken, [], '글로 고르면 읽지 않음')
  } finally { await typed.cleanup() }
  const view = await ask({ client: '대한' })
  const say = async (/** @type {string} */ words) => {
    await act(async () => { view.container.querySelector('.home-assistant-mic-btn').click() })
    await act(async () => {
      last.onresult({ results: [[{ transcript: words }]] })
      last.onend()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  try {
    await say('5월분')
    assert.deepEqual(synth.spoken, ['어떤 문구로 보낼까요? 미수금 안내, 입금 요청, 운행 완료.'])
    await say('미수금 안내')
    assert.deepEqual(synth.spoken.slice(1), ['대한에 이 문구로 보낼게요. 문자 열기를 눌러 주세요.'])
  } finally {
    await view.cleanup()
    delete window.webkitSpeechRecognition
    delete window.speechSynthesis
    delete window.SpeechSynthesisUtterance
  }
})
