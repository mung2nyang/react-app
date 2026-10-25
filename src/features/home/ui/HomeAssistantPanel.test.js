// 로드맵 24-B-1 — 운비서 카드: 누르면 늘어남, 줄 마이크 한 번에 듣기, 글로 보내기 → 내가 한 말·결과 글, 비회원은 안 부름.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'

// 점검표 서버 읽기·저장은 가짜로 — 그날 1장, 저장은 모아 둔다(멈춰 두기·실패 가능).
const inspect = { record: null, holdFetch: null, holdSave: null, saveError: null, saved: [], fetched: [] }
mock.module('../../../data/sync/dailyInspections.ts', {
  namedExports: {
    fetchDailyInspection: async (vehicleId, workDate) => { inspect.fetched.push({ vehicleId, workDate }); return inspect.holdFetch ? inspect.holdFetch : inspect.record },
    saveDailyInspection: async (input) => { if (inspect.holdSave) await inspect.holdSave; if (inspect.saveError) throw inspect.saveError; inspect.saved.push(input) },
    fetchMonthDailyInspections: async () => ({}),
    fetchVehiclesDailyInspections: async () => ({}),
    hasAnyDailyInspection: async () => false,
  },
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { withSession } = await import('../../../testSupport/withSession.js')
const { withToast } = await import('../../../testSupport/withToast.js')
const { supabase } = await import('../../../data/cloud/supabaseClient.ts')
const { commitCars, commitClients, commitDrivers, commitProfile, commitSettings, commitWorkData } = await import('../../../data/store/commitHelpers.ts')
const { EMPTY_PROFILE } = await import('../../../data/sync/profileSave.ts')
const { allGoodItems } = await import('../../../domain/dailyInspectionItems.ts')
const { SERVER_SAVE_FAIL } = await import('../../../shared/utils/failureMessages.js')
const { readOwnerSettings } = await import('../../../data/store/ownerDataHooks.ts')
const { normalizeSettings } = await import('../../../domain/practiceSettings.ts')
const { todayWorkLogSelection } = await import('../../../domain/calendar.ts')
const { default: HomeAssistantBar } = await import('./HomeAssistantBar.jsx')
const { UnbiseoProvider } = await import('../hooks/unbiseoContext.ts')

const calls = []
let reply = async () => ({ data: null, error: null })
supabase.functions = { invoke: async (name, options) => { calls.push({ name, body: options.body }); return reply() } }
const toasts = []
beforeEach(() => { calls.length = 0; toasts.length = 0; reply = async () => ({ data: null, error: null }) })

const CLOUD = { userId: 'u-assistant', name: '보리', accountType: 'owner' }

async function mount(ownerKey, session, { open = true, props = {} } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(withToast(withSession(React.createElement(UnbiseoProvider, { onOpenCall: props.onOpenAssistantCall || (() => {}) }, React.createElement(HomeAssistantBar)), { ownerKey, session }), (message) => { toasts.push(message) })) })
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

const EXPENSE_FUEL = { date: '2026-10-21', type: 'fuel', cost: 80000, name: '', category: '', fuelType: '주유', payment: '' }

test('보내는 동안 다시 보내기·글 칸이 잠기고, 지출·실패는 정해진 문구', async () => {
  let release = () => {}
  reply = () => new Promise((resolve) => { release = () => resolve({ data: { kind: 'expense', expense: EXPENSE_FUEL }, error: null }) })
  const view = await mount('u-assistant', CLOUD)
  try {
    await view.type('주유 8만원')
    await act(async () => { view.container.querySelector('.home-assistant-send').click() })
    assert.ok(view.container.querySelector('.home-assistant-send').disabled)
    assert.ok(view.container.querySelector('.home-assistant-input').disabled)
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '알아듣는 중…')
    await act(async () => { release(); await new Promise((resolve) => setTimeout(resolve, 0)) })
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '10월 21일 주유, 80,000원으로 기록할게요.')
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
  reply = async () => ({ data: { kind: 'expense', expense: EXPENSE_FUEL }, error: null })
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
    const parseCalls = () => calls.filter((call) => call.name === 'unbiseo-parse')
    assert.equal(parseCalls().length, 1)
    assert.equal(parseCalls()[0].body.text, '주유 8만원')
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '10월 21일 주유, 80,000원으로 기록할게요.')
    await act(async () => { view.container.querySelector('.home-assistant-mic-btn').click() })
    await act(async () => { last.onerror({ error: 'not-allowed' }); last.onend() })
    assert.equal(view.container.querySelector('.home-assistant-note')?.textContent, '마이크 권한을 켜 주세요. 글로 써도 됩니다.')
    assert.equal(parseCalls().length, 1, '받아쓴 말이 없으면 안 보냄')
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

// 로드맵 24-B-2 — 운행 결과 아래 [기록하기], "콜 상세"가 꺼져 있으면 [켜기] 먼저.
const CALL_REPLY = async () => ({ data: { kind: 'call', call: { date: '2026-10-21', loadLoc: '수원', unloadLoc: '화성', fare: 150000, client: '한진' } }, error: null })
const actionButton = (container, label) => [...container.querySelectorAll('.home-assistant-action')].find((el) => el.textContent === label)

test('콜 상세 켜짐: 운행 결과 아래 [기록하기] — 누르면 알아들은 운행을 그대로 넘긴다', async () => {
  commitSettings('u-assistant-on', normalizeSettings({ callDetail: true }))
  reply = CALL_REPLY
  const opened = []
  const view = await mount('u-assistant-on', CLOUD, { props: { onOpenAssistantCall: (call, options) => opened.push({ call, options }) } })
  try {
    await view.type('어제 수원 화성 15만 한진')
    await view.send()
    assert.equal(view.container.querySelector('.home-assistant-enable'), null)
    await act(async () => { actionButton(view.container, '기록하기').click() })
    assert.deepEqual(opened, [{ call: { date: '2026-10-21', loadLoc: '수원', unloadLoc: '화성', fare: 150000, client: '한진' }, options: { cancelOff: false } }])
  } finally { await view.cleanup() }
})

test('콜 상세 꺼짐: "켤까요?" + [켜기] → 앱 설정의 콜 상세가 켜지고 그 자리에 [기록하기]', async () => {
  commitSettings('u-assistant-off', normalizeSettings({ callDetail: false }))
  reply = CALL_REPLY
  const view = await mount('u-assistant-off', CLOUD, { props: { onOpenAssistantCall: () => {} } })
  try {
    await view.type('어제 수원 화성 15만')
    await view.send()
    assert.equal(actionButton(view.container, '기록하기'), undefined)
    assert.equal(view.container.querySelector('.home-assistant-enable .home-assistant-note')?.textContent, '콜 상세가 꺼져 있어요. 켤까요?')
    await act(async () => { actionButton(view.container, '켜기').click() })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    assert.equal(readOwnerSettings('u-assistant-off').callDetail, true)
    assert.ok(actionButton(view.container, '기록하기'))
    assert.equal(view.container.querySelector('.home-assistant-enable'), null)
  } finally { await view.cleanup() }
})

test('질문·실패 결과에는 [기록하기]·[켜기]가 없다', async () => {
  commitSettings('u-assistant-on', normalizeSettings({ callDetail: true }))
  reply = async () => ({ data: { kind: 'question', question: { type: 'revenue', period: { unit: 'month', value: '2026-10' }, client: '', expenseType: '' } }, error: null })
  const view = await mount('u-assistant-on', CLOUD)
  try {
    await view.type('이번 달 매출')
    await view.send()
    assert.equal(view.container.querySelector('.home-assistant-action'), null)
    reply = async () => { throw new Error('network') }
    await view.send()
    assert.equal(view.container.querySelector('.home-assistant-action'), null)
  } finally { await view.cleanup() }
})

// 로드맵 24-B-3-A — [기록하기] 전에 일지와 같은 기준으로 계약 기간·휴무를 본다.
const DRIVER = { userId: 'u-assistant-driver', name: '김기사', accountType: 'employed_driver' }
const callOn = (date) => async () => ({ data: { kind: 'call', call: { date, loadLoc: '수원', unloadLoc: '화성', fare: 150000, client: '' } }, error: null })

async function askAs(ownerKey, session, date, opened = []) {
  commitSettings(ownerKey, normalizeSettings({ callDetail: true }))
  reply = callOn(date)
  const view = await mount(ownerKey, session, { props: { onOpenAssistantCall: (call, options) => opened.push({ call, options }) } })
  await view.type('수원 화성 15만')
  await view.send()
  return view
}

test('연동 기사 + 계약 시작 전·끝난 뒤 날짜: 일지와 같은 안내 두 줄, 버튼 없음', async () => {
  commitDrivers('u-assistant-driver', [{ id: 'link-1', name: '김기사', phone: '', vehicleNumber: '34나5678', startDate: '2026-10-05', endDate: '2026-10-25', status: 'linked' }])
  let view = await askAs('u-assistant-driver', DRIVER, '2026-10-01')
  try {
    const notes = [...view.container.querySelectorAll('.home-assistant-enable .home-assistant-note')].map((el) => el.textContent)
    assert.deepEqual(notes, ['계약기간 전 날짜입니다.', '10월 5일부터 기록할 수 있습니다.'])
    assert.equal(view.container.querySelector('.home-assistant-action'), null)
  } finally { await view.cleanup() }
  view = await askAs('u-assistant-driver', DRIVER, '2026-10-26')
  try {
    const notes = [...view.container.querySelectorAll('.home-assistant-enable .home-assistant-note')].map((el) => el.textContent)
    assert.deepEqual(notes, ['계약기간이 끝난 날짜입니다.', '10월 25일까지 기록할 수 있습니다.'])
    assert.equal(view.container.querySelector('.home-assistant-action'), null)
  } finally { await view.cleanup() }
  view = await askAs('u-assistant-driver', DRIVER, '2026-10-10')
  try {
    assert.ok(actionButton(view.container, '기록하기'), '기간 안이면 그대로')
  } finally { await view.cleanup() }
})

test('차주는 연동 기사 줄이 있어도 기간 안내 없이 [기록하기]', async () => {
  commitDrivers('u-assistant-owner', [{ id: 'link-1', name: '김기사', phone: '', vehicleNumber: '34나5678', startDate: '2026-10-05', endDate: '', status: 'linked' }])
  const view = await askAs('u-assistant-owner', { userId: 'u-assistant-owner', name: '보리', accountType: 'owner' }, '2026-10-01')
  try {
    assert.ok(actionButton(view.container, '기록하기'))
  } finally { await view.cleanup() }
})

test('그날 휴무: "휴무를 취소하고 운행을 기록할까요?" + [휴무 취소하고 기록] → cancelOff를 같이 넘긴다', async () => {
  commitWorkData('u-assistant-off-day', { '2026-10-21': { isOff: true } })
  const opened = []
  const view = await askAs('u-assistant-off-day', { ...CLOUD, userId: 'u-assistant-off-day' }, '2026-10-21', opened)
  try {
    assert.equal(view.container.querySelector('.home-assistant-enable .home-assistant-note')?.textContent, '휴무를 취소하고 운행을 기록할까요?')
    assert.equal(actionButton(view.container, '기록하기'), undefined)
    await act(async () => { actionButton(view.container, '휴무 취소하고 기록').click() })
    assert.deepEqual(opened.map((item) => item.options), [{ cancelOff: true }])
    assert.equal(opened[0].call.date, '2026-10-21')
  } finally { await view.cleanup() }
})

// 로드맵 24-C-2 — 지출 결과 아래도 같은 자리에 [기록하기]·휴무·기간 안내(콜 상세 꺼짐은 운행만).
const expenseOn = (date) => async () => ({ data: { kind: 'expense', expense: { ...EXPENSE_FUEL, date } }, error: null })

test('지출: 콜 상세가 꺼져 있어도 [기록하기] — 누르면 알아들은 지출을 그대로 넘긴다', async () => {
  commitSettings('u-assistant-expense', normalizeSettings({ callDetail: false }))
  reply = expenseOn('2026-10-21')
  const opened = []
  const view = await mount('u-assistant-expense', { ...CLOUD, userId: 'u-assistant-expense' }, { props: { onOpenAssistantCall: (record, options) => opened.push({ record, options }) } })
  try {
    await view.type('어제 주유 8만원')
    await view.send()
    assert.equal(view.container.querySelector('.home-assistant-enable'), null, '켜기 안내 없음')
    await act(async () => { actionButton(view.container, '기록하기').click() })
    assert.deepEqual(opened, [{ record: { ...EXPENSE_FUEL, date: '2026-10-21' }, options: { cancelOff: false } }])
  } finally { await view.cleanup() }
})

test('지출 그날 휴무: "휴무를 취소하고 지출을 기록할까요?" + [휴무 취소하고 기록] → cancelOff를 같이 넘긴다', async () => {
  commitWorkData('u-assistant-expense-off', { '2026-10-21': { isOff: true } })
  reply = expenseOn('2026-10-21')
  const opened = []
  const view = await mount('u-assistant-expense-off', { ...CLOUD, userId: 'u-assistant-expense-off' }, { props: { onOpenAssistantCall: (record, options) => opened.push({ record, options }) } })
  try {
    await view.type('어제 주유 8만원')
    await view.send()
    assert.equal(view.container.querySelector('.home-assistant-enable .home-assistant-note')?.textContent, '휴무를 취소하고 지출을 기록할까요?')
    assert.equal(actionButton(view.container, '기록하기'), undefined)
    await act(async () => { actionButton(view.container, '휴무 취소하고 기록').click() })
    assert.deepEqual(opened.map((item) => item.options), [{ cancelOff: true }])
    assert.equal(opened[0].record.type, 'fuel')
  } finally { await view.cleanup() }
})

test('지출 + 연동 기사 계약 기간 밖: 일지와 같은 안내 두 줄, 버튼 없음', async () => {
  commitDrivers('u-assistant-driver', [{ id: 'link-1', name: '김기사', phone: '', vehicleNumber: '34나5678', startDate: '2026-10-05', endDate: '2026-10-25', status: 'linked' }])
  reply = expenseOn('2026-10-01')
  const view = await mount('u-assistant-driver', DRIVER)
  try {
    await view.type('주유 8만원')
    await view.send()
    const notes = [...view.container.querySelectorAll('.home-assistant-enable .home-assistant-note')].map((el) => el.textContent)
    assert.deepEqual(notes, ['계약기간 전 날짜입니다.', '10월 5일부터 기록할 수 있습니다.'])
    assert.equal(view.container.querySelector('.home-assistant-action'), null)
  } finally { await view.cleanup() }
})

// 로드맵 24-D-2 — 질문은 앱이 화면과 같은 계산으로 낸 답 문장, 버튼 없음.
test('질문: 내가 한 말 + 매출 화면과 같은 숫자의 답 문장, 버튼 없음 · 짧은 기간·그 밖은 안내', async () => {
  const owner = 'u-assistant-question'
  const thisMonth = todayWorkLogSelection(new Date()).dateKey.slice(0, 7)
  commitWorkData(owner, { [`${thisMonth}-01`]: { callDetails: [{ id: 'q-1', client: '한진', fare: '150,000' }, { id: 'q-2', client: '롯데', fare: '50,000' }] } })
  const ask = (question) => async () => ({ data: { kind: 'question', question: { client: '', expenseType: '', ...question } }, error: null })
  const view = await mount(owner, { ...CLOUD, userId: owner })
  const result = () => view.container.querySelector('.home-assistant-result')?.textContent
  try {
    reply = ask({ type: 'trips', period: { unit: 'month', value: thisMonth } })
    await view.type('이번 달 몇 번 뛰었어')
    await view.send()
    assert.equal(view.container.querySelector('.home-assistant-said')?.textContent, '내가 한 말: 이번 달 몇 번 뛰었어')
    assert.equal(result(), `${Number(thisMonth.slice(5))}월 운행은 2회입니다.`)
    assert.equal(view.container.querySelector('.home-assistant-action'), null)
    assert.equal(view.container.querySelector('.home-assistant-enable'), null)
    reply = ask({ type: 'revenue', period: { unit: 'month', value: thisMonth } })
    await view.send()
    assert.equal(result(), `${Number(thisMonth.slice(5))}월 매출은 200,000원입니다.`)
    reply = ask({ type: 'revenue', period: { unit: 'unsupported' } })
    await view.send()
    assert.equal(result(), '달이나 연으로 물어봐 주세요. 예: 이번 달 매출 얼마야')
    reply = ask({ type: 'other', period: { unit: 'month', value: thisMonth } })
    await view.send()
    assert.equal(result(), '아직 답할 수 없는 질문이에요. 매출·순이익·지출·미수금·운행 횟수를 물어봐 주세요.')
    assert.equal(calls.every((call) => !JSON.stringify(call.body).includes('200,000') && !JSON.stringify(call.body).includes('200000')), true, '서버로 숫자가 가지 않음')
  } finally { await view.cleanup() }
})

test('연동 기사 질문: 기사 본인 매출 화면 이름(정산액)', async () => {
  const owner = 'u-assistant-question-driver'
  const thisMonth = todayWorkLogSelection(new Date()).dateKey.slice(0, 7)
  reply = async () => ({ data: { kind: 'question', question: { type: 'netProfit', period: { unit: 'month', value: thisMonth }, client: '', expenseType: '' } }, error: null })
  const view = await mount(owner, { userId: owner, name: '김기사', accountType: 'employed_driver' })
  try {
    await view.type('이번 달 순이익')
    await view.send()
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, `${Number(thisMonth.slice(5))}월 정산액은 0원입니다.`)
  } finally { await view.cleanup() }
})

// 로드맵 24-E — 마이크로 말했을 때만 답을 소리로, [멈추기], 마이크를 다시 누르면 읽던 것 먼저 멈춤.
test('읽어 주기: 말로 보낸 답만 읽고, [멈추기]·다시 듣기·글로 보내기는 읽지 않거나 멈춘다', async () => {
  let last = null
  window.webkitSpeechRecognition = class {
    constructor() { last = this }
    start() {}
    stop() { this.onend?.() }
    abort() {}
  }
  const synth = { spoken: [], cancels: 0, speak(utterance) { this.spoken.push(utterance) }, cancel() { this.cancels += 1 } }
  window.speechSynthesis = synth
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
  reply = async () => ({ data: { kind: 'expense', expense: EXPENSE_FUEL }, error: null })
  const view = await mount('u-assistant', CLOUD, { open: false })
  const mic = () => view.container.querySelector('.home-assistant-mic-btn')
  const stopButton = () => actionButton(view.container, '멈추기')
  async function say(words) {
    await act(async () => { mic().click() })
    await act(async () => {
      last.onresult({ results: [[{ transcript: words }]] })
      last.onend()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  try {
    await say('주유 8만원')
    assert.deepEqual(calls.filter((call) => call.name === 'unbiseo-voice').map((call) => call.body), [{ text: '10월 21일 주유, 80,000원으로 기록할게요.' }], 'xAI 목소리를 먼저 부름')
    assert.equal(synth.spoken.length, 1, 'xAI 소리를 못 받으면 휴대폰 목소리')
    assert.equal(synth.spoken[0].text, '10월 21일 주유, 80,000원으로 기록할게요.')
    assert.equal(synth.spoken[0].lang, 'ko-KR')
    assert.ok(stopButton(), '읽는 동안 [멈추기]')
    let before = synth.cancels
    await act(async () => { stopButton().click() })
    assert.equal(synth.cancels, before + 1)
    assert.equal(stopButton(), undefined)

    await say('주유 8만원')
    assert.equal(synth.spoken.length, 2)
    before = synth.cancels
    await act(async () => { mic().click() })
    assert.equal(synth.cancels, before + 1, '듣기를 시작하면 읽던 것을 먼저 멈춤')
    assert.ok(mic().classList.contains('listening'))
    assert.equal(stopButton(), undefined)
    await act(async () => { last.onend() })

    await view.type('주유 8만원')
    await view.send()
    assert.equal(synth.spoken.length, 2, '글로 보낸 답은 읽지 않음')
    assert.equal(calls.filter((call) => call.name === 'unbiseo-voice').length, 2, '글로 보낸 답은 목소리도 안 부름')
    assert.equal(stopButton(), undefined)

    await say('주유 8만원')
    await act(async () => { synth.spoken[2].onend() })
    assert.equal(stopButton(), undefined, '다 읽으면 [멈추기]가 사라짐')
  } finally {
    await view.cleanup()
    delete window.webkitSpeechRecognition
    delete window.speechSynthesis
    delete window.SpeechSynthesisUtterance
  }
})

// 로드맵 24-F-2 — 고정 노선: 칩이 보이는 계정만 노선 이름을 보내고, 버튼 자리는 꺼짐 [켜기] → 휴무 → [기록하기].
test('고정 노선: 노선 칩이 보이면 이름을 같이 보내고, 문장 아래 [기록하기] — 누르면 알아들은 고정 노선을 넘긴다', async () => {
  const owner = 'u-assistant-fixed'
  commitSettings(owner, normalizeSettings({ fixedRouteOn: true, fixedRoutePresets: [{ id: 'r1', loadLoc: '평택', unloadLoc: '용인' }] }))
  const today = todayWorkLogSelection(new Date()).dateKey
  reply = async () => ({ data: { kind: 'fixed', fixed: { date: today, count: 2, route: '평택 → 용인' } }, error: null })
  const opened = []
  const view = await mount(owner, { ...CLOUD, userId: owner }, { props: { onOpenAssistantCall: (record, options) => opened.push({ record, options }) } })
  try {
    await view.type('평택 용인 고정 2번 뛰었어')
    await view.send()
    assert.deepEqual(calls[0].body.routeNames, ['평택 → 용인'])
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '오늘 평택 → 용인 2회로 기록할게요.')
    await act(async () => { actionButton(view.container, '기록하기').click() })
    assert.deepEqual(opened, [{ record: { date: today, count: 2, route: '평택 → 용인' }, options: { cancelOff: false } }])
  } finally { await view.cleanup() }
})

test('고정 노선: 노선 칩을 끈 계정은 노선 이름을 보내지 않는다', async () => {
  const owner = 'u-assistant-fixed-chips-off'
  commitSettings(owner, normalizeSettings({ fixedRouteOn: false, fixedRoutePresets: [{ id: 'r1', loadLoc: '평택', unloadLoc: '용인' }] }))
  const view = await mount(owner, { ...CLOUD, userId: owner })
  try {
    await view.type('오늘 고정 3번')
    await view.send()
    assert.equal('routeNames' in calls[0].body, false)
  } finally { await view.cleanup() }
})

test('고정 노선 꺼짐: "켤까요?" + [켜기] → 앱 설정의 고정 노선이 켜지고 [기록하기], 그날 휴무면 [휴무 취소하고 기록]', async () => {
  const owner = 'u-assistant-fixed-off'
  commitSettings(owner, normalizeSettings({ fixedOn: false }))
  commitWorkData(owner, { '2026-10-21': { isOff: true } })
  reply = async () => ({ data: { kind: 'fixed', fixed: { date: '2026-10-21', count: 3, route: '' } }, error: null })
  const opened = []
  const view = await mount(owner, { ...CLOUD, userId: owner }, { props: { onOpenAssistantCall: (record, options) => opened.push({ record, options }) } })
  try {
    await view.type('어제 고정 3번')
    await view.send()
    assert.equal('routeNames' in calls[0].body, false, '고정 노선이 꺼졌으면 노선 이름 안 보냄')
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '10월 21일 고정 노선 3회로 기록할게요.')
    assert.equal(view.container.querySelector('.home-assistant-enable .home-assistant-note')?.textContent, '고정 노선이 꺼져 있어요. 켤까요?')
    await act(async () => { actionButton(view.container, '켜기').click() })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    assert.equal(readOwnerSettings(owner).fixedOn, true)
    assert.equal(view.container.querySelector('.home-assistant-enable .home-assistant-note')?.textContent, '휴무를 취소하고 고정 노선을 기록할까요?')
    await act(async () => { actionButton(view.container, '휴무 취소하고 기록').click() })
    assert.deepEqual(opened, [{ record: { date: '2026-10-21', count: 3, route: '' }, options: { cancelOff: true } }])
  } finally { await view.cleanup() }
})

// 로드맵 24-G-2 — 거래처 등록: 문장 + [등록하기], 이미 있는 이름이면 문장만.
test('거래처 등록: 문장 아래 [등록하기] — 누르면 들은 거래처를 넘긴다, 이미 있는 이름이면 버튼 없이 알림', async () => {
  const owner = 'u-assistant-client'
  commitClients(owner, [{ id: 'c1', companyName: '롯데' }])
  const heard = { name: '한진', manager: '김철수', phone: '010-1234-5678', paymentTerm: 'next_month_end', paymentTermValue: null, commType: 'percent', commValue: 5 }
  reply = async () => ({ data: { kind: 'client', client: heard }, error: null })
  const opened = []
  const view = await mount(owner, { ...CLOUD, userId: owner }, { props: { onOpenAssistantCall: (record, options) => opened.push({ record, options }) } })
  try {
    await view.type('거래처 등록 한진 김철수 010-1234-5678 익월 말일 수수료 5%')
    await view.send()
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '한진을 거래처로 등록할게요. (담당자 김철수, 010-1234-5678, 익월 말일 정산, 수수료 5%)')
    assert.equal(actionButton(view.container, '기록하기'), undefined)
    await act(async () => { actionButton(view.container, '등록하기').click() })
    assert.deepEqual(opened, [{ record: heard, options: { cancelOff: false } }])

    reply = async () => ({ data: { kind: 'client', client: { ...heard, name: '롯데' } }, error: null })
    await view.type('거래처 등록 롯데')
    await view.send()
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '롯데는 이미 등록된 거래처예요.')
    assert.equal(view.container.querySelector('.home-assistant-action'), null, '버튼 없음')
  } finally { await view.cleanup() }
})

// 로드맵 24-I-2 — 날씨: 기다리는 동안 "날씨를 알아보는 중…"·입력 잠김, 받아 온 뒤 문장, 마이크면 그 문장만 읽기, 계정이 바뀌면 버림.
const WEATHER_DAY = { date: '', sky: 'cloudy', precip: 'rain', min: 18, max: 23, pop: 60 }
function weatherReplies() {
  let release = () => {}
  const today = todayWorkLogSelection(new Date()).dateKey
  supabase.functions = {
    invoke: async (name, options) => {
      calls.push({ name, body: options.body })
      if (name === 'unbiseo-parse') return { data: { kind: 'weather', weather: { date: today, place: '평택' } }, error: null }
      if (name === 'unbiseo-weather') return new Promise((resolve) => { release = () => resolve({ data: { kind: 'weather', weather: { ...WEATHER_DAY, date: today } }, error: null }) })
      return { data: null, error: null }
    },
  }
  return { release: async () => { await act(async () => { release(); await new Promise((resolve) => setTimeout(resolve, 0)) }) } }
}
const restoreInvoke = () => { supabase.functions = { invoke: async (name, options) => { calls.push({ name, body: options.body }); return reply() } } }
const SAID = '오늘 평택 날씨는 흐리고 비, 18~23도, 비 올 확률 60%예요.'

test('날씨: 기다리는 동안 문구·입력 잠김, 받아 온 뒤 날씨 문장, 글로 보낸 답은 읽지 않음', async () => {
  const server = weatherReplies()
  const view = await mount('u-assistant', CLOUD)
  try {
    await view.type('오늘 평택 날씨 어때')
    await view.send()
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '날씨를 알아보는 중…')
    assert.equal(view.container.querySelector('.home-assistant-input')?.disabled, true)
    await server.release()
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, SAID)
    assert.equal(view.container.querySelector('.home-assistant-input')?.disabled, false)
    assert.equal(view.container.querySelector('.home-assistant-said')?.textContent, '내가 한 말: 오늘 평택 날씨 어때')
    assert.deepEqual(calls.map((call) => call.name), ['unbiseo-parse', 'unbiseo-weather'], '글로 보낸 답은 목소리를 안 부름')
    assert.deepEqual(calls[1].body, { date: todayWorkLogSelection(new Date()).dateKey, place: '평택' })
    assert.equal(view.container.querySelector('.home-assistant-action'), null, '버튼 없음')
  } finally { await view.cleanup(); restoreInvoke() }
})

test('날씨: 마이크로 물으면 받아 온 날씨 문장만 소리로 읽는다', async () => {
  let last = null
  window.webkitSpeechRecognition = class { constructor() { last = this } start() {} stop() { this.onend?.() } abort() {} }
  const synth = { spoken: [], speak(utterance) { this.spoken.push(utterance.text) }, cancel() {} }
  window.speechSynthesis = synth
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
  const server = weatherReplies()
  const view = await mount('u-assistant', CLOUD, { open: false })
  try {
    await act(async () => { view.container.querySelector('.home-assistant-mic-btn').click() })
    await act(async () => {
      last.onresult({ results: [[{ transcript: '오늘 평택 날씨 어때' }]] })
      last.onend()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    assert.deepEqual(synth.spoken, [], '기다리는 문구는 읽지 않음')
    await server.release()
    assert.deepEqual(calls.filter((call) => call.name === 'unbiseo-voice').map((call) => call.body), [{ text: SAID }])
    assert.deepEqual(synth.spoken, [SAID])
  } finally {
    await view.cleanup()
    restoreInvoke()
    delete window.webkitSpeechRecognition
    delete window.speechSynthesis
    delete window.SpeechSynthesisUtterance
  }
})

test('날씨: 기다리는 동안 계정이 바뀌면 받아 온 날씨는 버린다', async () => {
  const server = weatherReplies()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const render = (ownerKey, session) => root.render(withSession(React.createElement(UnbiseoProvider, { onOpenCall: () => {} }, React.createElement(HomeAssistantBar)), { ownerKey, session }))
  try {
    await act(async () => { render('u-assistant', CLOUD) })
    await act(async () => { container.querySelector('.home-assistant-toggle').click() })
    const input = container.querySelector('.home-assistant-input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    await act(async () => { setter.call(input, '오늘 평택 날씨 어때'); input.dispatchEvent(new window.Event('input', { bubbles: true })) })
    await act(async () => { container.querySelector('.home-assistant-send').click(); await new Promise((resolve) => setTimeout(resolve, 0)) })
    assert.equal(container.querySelector('.home-assistant-result')?.textContent, '날씨를 알아보는 중…')
    await act(async () => { render('u-other', { ...CLOUD, userId: 'u-other' }) })
    await server.release()
    assert.equal(container.querySelector('.home-assistant-result'), null, '다른 계정 카드에 앞 계정 날씨가 안 뜸')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
    restoreInvoke()
  }
})

// 로드맵 24-J-2 — 점검표: 확인하는 동안 문구·잠김, [저장하기] → 일지 창과 같은 저장 → "저장했어요", 실패면 알림·버튼 남음, 두 번 눌림은 한 번만, 계정이 바뀌면 버림.
const INSPECT_OWNER = 'u-assistant-inspect'
const INSPECT_SESSION = { ...CLOUD, userId: INSPECT_OWNER }
const WILL_SAVE = '오늘 일상점검표를 모두 양호로 저장할게요.'
const SAVED = '오늘 일상점검표를 모두 양호로 저장했어요.'
function inspectionSetup() {
  Object.assign(inspect, { record: null, holdFetch: null, holdSave: null, saveError: null, saved: [], fetched: [] })
  commitSettings(INSPECT_OWNER, normalizeSettings({ dailyInspectionOn: true }))
  commitCars(INSPECT_OWNER, [{ id: 'c-main', type: 'main', number: '12가3456', supabaseId: 'veh-main' }])
  commitProfile(INSPECT_OWNER, { ...EMPTY_PROFILE, name: '보리' })
  reply = async () => ({ data: { kind: 'inspection', inspection: { date: todayWorkLogSelection(new Date()).dateKey } }, error: null })
}
const held = () => { let release = () => {}; const promise = new Promise((resolve) => { release = resolve }); return { promise, release } }
const saveButton = (container) => [...container.querySelectorAll('.home-assistant-action')].find((button) => button.textContent === '저장하기') || null
const resultOf = (container) => container.querySelector('.home-assistant-result')?.textContent
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

test('점검표: 확인하는 동안 문구·입력 잠김 → [저장하기] → 저장 중 잠금·두 번 눌러도 한 번 → "저장했어요", 버튼 사라짐', async () => {
  inspectionSetup()
  const fetchHold = held()
  inspect.holdFetch = fetchHold.promise
  const view = await mount(INSPECT_OWNER, INSPECT_SESSION)
  try {
    await view.type('오늘 점검표 모두 양호')
    await view.send()
    assert.equal(resultOf(view.container), '점검표를 확인하는 중…')
    assert.equal(view.container.querySelector('.home-assistant-input')?.disabled, true)
    assert.equal(saveButton(view.container), null)
    await act(async () => { fetchHold.release(null) })
    await settle()
    const today = todayWorkLogSelection(new Date()).dateKey
    assert.deepEqual(inspect.fetched, [{ vehicleId: 'veh-main', workDate: today }])
    assert.equal(resultOf(view.container), WILL_SAVE)
    assert.equal(view.container.querySelector('.home-assistant-input')?.disabled, false)
    const saveHold = held()
    inspect.holdSave = saveHold.promise
    await act(async () => { saveButton(view.container).click(); saveButton(view.container).click() })
    assert.equal(saveButton(view.container)?.disabled, true, '저장 중 잠금')
    await act(async () => { saveHold.release() })
    await settle()
    assert.deepEqual(inspect.saved, [{ vehicleId: 'veh-main', workDate: today, items: allGoodItems(), actionNote: '', inspectorName: '보리' }], '한 번만, 일지 창과 같은 몸통')
    assert.equal(resultOf(view.container), SAVED)
    assert.equal(saveButton(view.container), null)
    assert.deepEqual(toasts, [])
  } finally { await view.cleanup() }
})

test('점검표: 저장 실패면 일지 창과 같은 알림이 뜨고 문장·버튼은 그대로', async () => {
  inspectionSetup()
  inspect.saveError = new Error('')
  const view = await mount(INSPECT_OWNER, INSPECT_SESSION)
  const errors = mock.method(console, 'error', () => {})
  try {
    await view.type('오늘 점검표 모두 양호')
    await view.send()
    await act(async () => { saveButton(view.container).click() })
    await settle()
    assert.deepEqual(toasts, [SERVER_SAVE_FAIL])
    assert.equal(resultOf(view.container), WILL_SAVE)
    assert.equal(saveButton(view.container)?.disabled, false, '다시 누를 수 있음')
  } finally { errors.mock.restore(); await view.cleanup() }
})

test('점검표: 이미 저장된 날·설정 꺼짐은 문장만, 버튼 없음', async () => {
  inspectionSetup()
  inspect.record = { items: allGoodItems(), actionNote: '', inspectorName: '보리' }
  const view = await mount(INSPECT_OWNER, INSPECT_SESSION)
  try {
    await view.type('오늘 점검표 모두 양호')
    await view.send()
    assert.equal(resultOf(view.container), '오늘 일상점검표는 이미 저장되어 있어요.')
    assert.equal(saveButton(view.container), null)
    commitSettings(INSPECT_OWNER, normalizeSettings({ dailyInspectionOn: false }))
    inspect.fetched = []
    await view.type('오늘 점검표 모두 양호')
    await view.send()
    assert.equal(resultOf(view.container), '앱 설정에서 일상점검표 사용을 켜면 쓸 수 있어요.')
    assert.equal(saveButton(view.container), null)
    assert.deepEqual(inspect.fetched, [], '꺼져 있으면 서버를 읽지 않음')
  } finally { await view.cleanup() }
})

test('점검표: 마이크로 물으면 확인 뒤 문장만 읽고, 저장 뒤 문장은 읽지 않는다', async () => {
  inspectionSetup()
  let last = null
  window.webkitSpeechRecognition = class { constructor() { last = this } start() {} stop() { this.onend?.() } abort() {} }
  window.speechSynthesis = { speak() {}, cancel() {} }
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
  const view = await mount(INSPECT_OWNER, INSPECT_SESSION, { open: false })
  try {
    await act(async () => { view.container.querySelector('.home-assistant-mic-btn').click() })
    await act(async () => {
      last.onresult({ results: [[{ transcript: '오늘 점검표 모두 양호' }]] })
      last.onend()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await settle()
    const voiced = () => calls.filter((call) => call.name === 'unbiseo-voice').map((call) => call.body.text)
    assert.deepEqual(voiced(), [WILL_SAVE])
    await act(async () => { saveButton(view.container).click() })
    await settle()
    assert.equal(resultOf(view.container), SAVED)
    assert.deepEqual(voiced(), [WILL_SAVE], '저장 뒤 문장은 읽지 않음')
  } finally {
    await view.cleanup()
    delete window.webkitSpeechRecognition
    delete window.speechSynthesis
    delete window.SpeechSynthesisUtterance
  }
})

test('점검표: 저장하는 동안 계정이 바뀌면 결과도 알림도 붙이지 않는다', async () => {
  inspectionSetup()
  const saveHold = held()
  inspect.holdSave = saveHold.promise
  inspect.saveError = new Error('x')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const render = (ownerKey, session) => root.render(withToast(withSession(React.createElement(UnbiseoProvider, { onOpenCall: () => {} }, React.createElement(HomeAssistantBar)), { ownerKey, session }), (message) => { toasts.push(message) }))
  const errors = mock.method(console, 'error', () => {})
  try {
    await act(async () => { render(INSPECT_OWNER, INSPECT_SESSION) })
    await act(async () => { container.querySelector('.home-assistant-toggle').click() })
    const input = container.querySelector('.home-assistant-input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    await act(async () => { setter.call(input, '오늘 점검표 모두 양호'); input.dispatchEvent(new window.Event('input', { bubbles: true })) })
    await act(async () => { container.querySelector('.home-assistant-send').click(); await new Promise((resolve) => setTimeout(resolve, 0)) })
    await settle()
    assert.equal(container.querySelector('.home-assistant-result')?.textContent, WILL_SAVE)
    await act(async () => { saveButton(container).click() })
    await act(async () => { render('u-other', { ...CLOUD, userId: 'u-other' }) })
    await act(async () => { saveHold.release() })
    await settle()
    assert.equal(container.querySelector('.home-assistant-result'), null, '다른 계정 카드에 앞 계정 결과가 안 뜸')
    assert.deepEqual(toasts, [], '앞 계정 실패 알림도 안 뜸')
  } finally {
    errors.mock.restore()
    await act(async () => { root.unmount() })
    container.remove()
  }
})

// 로드맵 24-K-2 — 휴무: "{날짜}을 휴무로 할게요." + [휴무로 하기] → 그 날짜 일지로 넘김, 이미 휴무·휴무 아님은 문장만, 연동 기사 기간 밖은 기간 안내.
const offReply = (date, off) => { reply = async () => ({ data: { kind: 'dayOff', dayOff: { date, off } }, error: null }) }
const offButton = (container) => [...container.querySelectorAll('.home-assistant-action')].find((button) => /휴무로 하기|휴무 취소하기/.test(button.textContent)) || null

test('휴무: 문장과 [휴무로 하기] — 누르면 들은 날짜·휴무를 넘긴다, 취소 말이면 [휴무 취소하기]', async () => {
  const today = todayWorkLogSelection(new Date()).dateKey
  commitWorkData('u-assistant-dayoff', { '2026-10-03': { isOff: true } })
  const opened = []
  const view = await mount('u-assistant-dayoff', { ...CLOUD, userId: 'u-assistant-dayoff' }, { props: { onOpenAssistantCall: (record, options) => { opened.push({ record, options }) } } })
  try {
    offReply(today, true)
    await view.type('오늘 휴무')
    await view.send()
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '오늘을 휴무로 할게요.')
    assert.equal(offButton(view.container)?.textContent, '휴무로 하기')
    await act(async () => { offButton(view.container).click() })
    assert.deepEqual(opened, [{ record: { date: today, off: true }, options: { cancelOff: false } }])
    offReply('2026-10-03', false)
    await view.type('10월 3일 휴무 취소')
    await view.send()
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '10월 3일 휴무를 취소할게요.')
    assert.equal(offButton(view.container)?.textContent, '휴무 취소하기')
  } finally { await view.cleanup() }
})

test('휴무: 이미 휴무·휴무 아님은 문장만, 버튼 없음', async () => {
  commitWorkData('u-assistant-dayoff-same', { '2026-10-03': { isOff: true } })
  const view = await mount('u-assistant-dayoff-same', { ...CLOUD, userId: 'u-assistant-dayoff-same' })
  try {
    offReply('2026-10-03', true)
    await view.type('10월 3일 휴무')
    await view.send()
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '10월 3일은 이미 휴무예요.')
    assert.equal(offButton(view.container), null)
    offReply('2026-10-04', false)
    await view.type('10월 4일 휴무 취소')
    await view.send()
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '10월 4일은 휴무가 아니에요.')
    assert.equal(offButton(view.container), null)
    assert.equal(view.container.querySelector('.home-assistant-action'), null)
  } finally { await view.cleanup() }
})

test('휴무: 연동 기사 계약 기간 밖이면 이미 휴무여도 기간 안내, 버튼 없음 — 기간 안이면 [휴무로 하기]', async () => {
  const OWNER = 'u-assistant-dayoff-driver'
  const SESSION = { userId: OWNER, name: '김기사', accountType: 'employed_driver' }
  commitDrivers(OWNER, [{ id: 'link-1', name: '김기사', phone: '', vehicleNumber: '34나5678', startDate: '2026-10-05', endDate: '2026-10-25', status: 'linked' }])
  commitWorkData(OWNER, { '2026-10-01': { isOff: true } })
  const view = await mount(OWNER, SESSION)
  try {
    offReply('2026-10-01', true)
    await view.type('10월 1일 휴무')
    await view.send()
    assert.equal(view.container.querySelector('.home-assistant-result')?.textContent, '10월 1일을 휴무로 할게요.')
    const notes = [...view.container.querySelectorAll('.home-assistant-enable .home-assistant-note')].map((el) => el.textContent)
    assert.deepEqual(notes, ['계약기간 전 날짜입니다.', '10월 5일부터 기록할 수 있습니다.'])
    assert.equal(offButton(view.container), null)
    offReply('2026-10-10', true)
    await view.type('10월 10일 휴무')
    await view.send()
    assert.equal(offButton(view.container)?.textContent, '휴무로 하기')
  } finally { await view.cleanup() }
})
