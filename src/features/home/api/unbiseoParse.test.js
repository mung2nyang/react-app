// @ts-check
// 로드맵 24-B-1 — 운비서 서버 함수 부르기: 보내는 값, 응답 모양 확인, 실패 문구.
import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'

/** @typedef {import('../../../domain/jsonTypes.ts').JsonValue} JsonValue */
/** @type {Array<{ name: string, body: JsonValue }>} */
const calls = []
/** @type {() => Promise<{ data: JsonValue, error: Error|null }>} */
let reply = async () => ({ data: null, error: null })

mock.module('../../../data/cloud/supabaseClient.ts', {
  namedExports: {
    supabase: {
      functions: {
        /** @param {string} name @param {{ body: JsonValue }} options */
        invoke: async (name, options) => { calls.push({ name, body: options.body }); return reply() },
      },
    },
  },
})

const { requestUnbiseoParse, clientNamesForAi, routeNamesForAi, BAD_INPUT, LOGIN_NEEDED, NOT_UNDERSTOOD, TRY_LATER } = await import('./unbiseoParse.ts')
const { describeFixed } = await import('./unbiseoSentence.ts')

beforeEach(() => { calls.length = 0; reply = async () => ({ data: null, error: null }) })

/** @param {number} status */
function httpError(status) {
  return new FunctionsHttpError(new Response('{}', { status }))
}

test('보내는 값: 앞뒤 공백 정리한 말·오늘·거래처 이름(빈 이름·51자·겹침 빼고), 운행 칸을 그대로 돌려준다', async () => {
  reply = async () => ({ data: { kind: 'call', call: { date: '2026-10-21', loadLoc: '수원', unloadLoc: '화성', fare: 150000, client: '' } }, error: null })
  const result = await requestUnbiseoParse({ text: '  어제 수원 화성 15만 ', today: '2026-10-22', clientNames: ['한진', ' ', '한진', 'ㄱ'.repeat(51), '롯데'] })
  assert.deepEqual(calls, [{ name: 'unbiseo-parse', body: { text: '어제 수원 화성 15만', today: '2026-10-22', clientNames: ['한진', '롯데'] } }])
  assert.deepEqual(result, { kind: 'call', call: { date: '2026-10-21', loadLoc: '수원', unloadLoc: '화성', fare: 150000, client: '' } })
})

test('거래처 이름은 200개까지만', () => {
  const names = Array.from({ length: 250 }, (_, i) => `거래처${i}`)
  assert.equal(clientNamesForAi(names).length, 200)
})

test('운행 칸이 이상하면 고쳐 담는다: 날짜 모양이 아니면 오늘, 금액이 정수가 아니거나 음수면 없음', async () => {
  reply = async () => ({ data: { kind: 'call', call: { date: '어제', loadLoc: 3, fare: -5 } }, error: null })
  assert.deepEqual(await requestUnbiseoParse({ text: '평택 용인', today: '2026-10-22', clientNames: [] }), {
    kind: 'call', call: { date: '2026-10-22', loadLoc: '', unloadLoc: '', fare: null, client: '' },
  })
  reply = async () => ({ data: { kind: 'call', call: { fare: 1.5 } }, error: null })
  const odd = await requestUnbiseoParse({ text: '평택 용인', today: '2026-10-22', clientNames: [] })
  assert.equal(odd.kind === 'call' ? odd.call.fare : 'x', null)
})

test('관계없음은 종류만, 질문은 질문 칸을 읽고, 모르는 종류·모양이 틀리면 알아듣지 못함', async () => {
  reply = async () => ({ data: { kind: 'unknown' }, error: null })
  assert.deepEqual(await requestUnbiseoParse({ text: '오늘 날씨', today: '2026-10-22', clientNames: [] }), { kind: 'unknown' })
  reply = async () => ({ data: { kind: 'question', question: { type: 'unpaid', period: { unit: 'all' }, client: '한진', expenseType: '' } }, error: null })
  assert.deepEqual(await requestUnbiseoParse({ text: '한진 미수금', today: '2026-10-22', clientNames: [] }), {
    kind: 'question', question: { type: 'unpaid', period: { unit: 'all' }, client: '한진', expenseType: '' },
  })
  reply = async () => ({ data: { kind: 'question', question: { type: 'weather', period: { unit: 'day' } } }, error: null })
  assert.deepEqual(await requestUnbiseoParse({ text: '뭐', today: '2026-10-22', clientNames: [] }), {
    kind: 'question', question: { type: 'other', period: { unit: 'month', value: '2026-10' }, client: '', expenseType: '' },
  })
  /** @type {Array<JsonValue>} */
  const odd = [{ kind: 'weather' }, { kind: 'call' }, { kind: 'expense' }, { kind: 'expense', expense: [] }, { kind: 'question' }, { kind: 'question', question: 'revenue' }, null, 'call', []]
  for (const data of odd) {
    reply = async () => ({ data, error: null })
    assert.deepEqual(await requestUnbiseoParse({ text: '뭐', today: '2026-10-22', clientNames: [] }), { kind: 'error', message: NOT_UNDERSTOOD })
  }
})

// 로드맵 24-I-2 — 날씨 칸 읽기: 날짜 모양이 틀리면 오늘, 지역은 30자까지, 앞뒤 공백 뺌.
test('날씨 칸: 날짜·지역을 읽고, 칸이 없으면 알아듣지 못함', async () => {
  reply = async () => ({ data: { kind: 'weather', weather: { date: '2026-10-23', place: ' 평택 ' } }, error: null })
  assert.deepEqual(await requestUnbiseoParse({ text: '내일 평택 날씨', today: '2026-10-22', clientNames: [] }), { kind: 'weather', weather: { date: '2026-10-23', place: '평택' } })
  reply = async () => ({ data: { kind: 'weather', weather: { date: '내일', place: '가'.repeat(40) } }, error: null })
  assert.deepEqual(await requestUnbiseoParse({ text: '날씨', today: '2026-10-22', clientNames: [] }), { kind: 'weather', weather: { date: '2026-10-22', place: '가'.repeat(30) } })
  reply = async () => ({ data: { kind: 'weather', weather: { place: 7 } }, error: null })
  assert.deepEqual(await requestUnbiseoParse({ text: '날씨', today: '2026-10-22', clientNames: [] }), { kind: 'weather', weather: { date: '2026-10-22', place: '' } })
  reply = async () => ({ data: { kind: 'weather', weather: 'rain' }, error: null })
  assert.deepEqual(await requestUnbiseoParse({ text: '날씨', today: '2026-10-22', clientNames: [] }), { kind: 'error', message: NOT_UNDERSTOOD })
})

// 로드맵 24-J-2 — 점검표 칸 읽기: 날짜 모양이 틀리면 오늘, 칸이 없으면 알아듣지 못함.
test('점검표 칸: 날짜를 읽고, 칸이 없으면 알아듣지 못함', async () => {
  const ask = () => requestUnbiseoParse({ text: '점검표 모두 양호', today: '2026-10-22', clientNames: [] })
  reply = async () => ({ data: { kind: 'inspection', inspection: { date: '2026-10-21' } }, error: null })
  assert.deepEqual(await ask(), { kind: 'inspection', inspection: { date: '2026-10-21' } })
  reply = async () => ({ data: { kind: 'inspection', inspection: { date: '어제', items: 'bad' } }, error: null })
  assert.deepEqual(await ask(), { kind: 'inspection', inspection: { date: '2026-10-22' } })
  /** @type {Array<JsonValue>} */
  const odd = [{ kind: 'inspection' }, { kind: 'inspection', inspection: [] }, { kind: 'inspection', inspection: '2026-10-21' }]
  for (const data of odd) {
    reply = async () => ({ data, error: null })
    assert.deepEqual(await ask(), { kind: 'error', message: NOT_UNDERSTOOD })
  }
})

// 로드맵 24-C-2 — 지출 칸 읽기·문장.
test('지출 칸을 그대로 돌려준다, 이상한 칸은 고쳐 담는다(날짜 모양 아니면 오늘, 모르는 종류는 정비, 금액 정수 아니면 없음)', async () => {
  const expense = { date: '2026-10-21', type: 'fuel', cost: 120000, name: '경유', category: '', fuelType: '주유', payment: '카드' }
  reply = async () => ({ data: { kind: 'expense', expense }, error: null })
  assert.deepEqual(await requestUnbiseoParse({ text: '어제 경유 12만원', today: '2026-10-22', clientNames: [] }), { kind: 'expense', expense })
  reply = async () => ({ data: { kind: 'expense', expense: { date: '어제', type: 'repair', cost: -5, name: 3, payment: ' 현금 ' } }, error: null })
  assert.deepEqual(await requestUnbiseoParse({ text: '수리', today: '2026-10-22', clientNames: [] }), {
    kind: 'expense', expense: { date: '2026-10-22', type: 'maint', cost: null, name: '', category: '', fuelType: '', payment: '현금' },
  })
  reply = async () => ({ data: { kind: 'expense', expense: { type: 'misc', cost: 1.5 } }, error: null })
  const odd = await requestUnbiseoParse({ text: '통행료', today: '2026-10-22', clientNames: [] })
  assert.equal(odd.kind === 'expense' ? odd.expense.cost : 'x', null)
  assert.equal(odd.kind === 'expense' ? odd.expense.type : 'x', 'misc')
})

test('지출 문장: 주유는 주유 종류, 그 밖은 항목명 → 분류 → 종류 이름, 빈 칸은 빼고 끝 글자 받침에 따라 "으로"/"로"', async () => {
  const { describeExpense, describeResult } = await import('./unbiseoSentence.ts')
  const today = '2026-10-22'
  /** @type {import('./unbiseoParse.ts').UnbiseoExpense} */
  const base = { date: today, type: 'maint', cost: null, name: '', category: '', fuelType: '', payment: '' }
  assert.equal(describeExpense({ ...base, date: '2026-10-21', type: 'fuel', cost: 120000, name: '경유', fuelType: '주유' }, today), '10월 21일 주유, 120,000원으로 기록할게요.')
  assert.equal(describeExpense({ ...base, type: 'fuel', fuelType: '요소수', cost: 30000 }, today), '오늘 요소수, 30,000원으로 기록할게요.')
  assert.equal(describeExpense({ ...base, type: 'fuel' }, today), '오늘 주유로 기록할게요.')
  assert.equal(describeExpense({ ...base, cost: 150000, name: '엔진오일 교환', category: '소모품', payment: '현금' }, today), '오늘 엔진오일 교환, 150,000원, 현금으로 기록할게요.')
  assert.equal(describeExpense({ ...base, name: '와이퍼' }, today), '오늘 와이퍼로 기록할게요.')
  assert.equal(describeExpense({ ...base, category: '판금/도장', cost: 500000, payment: '카드' }, today), '오늘 판금/도장, 500,000원, 카드로 기록할게요.')
  assert.equal(describeExpense({ ...base }, today), '오늘 정비로 기록할게요.')
  assert.equal(describeExpense({ ...base, type: 'misc', cost: 5000 }, today), '오늘 기타, 5,000원으로 기록할게요.')
  assert.equal(describeResult({ kind: 'expense', expense: { ...base, type: 'misc', name: '통행료', category: '통행료', cost: 5000 } }, today, () => ''), '오늘 통행료, 5,000원으로 기록할게요.')
})

test('빈 말·301자는 서버를 부르지 않는다', async () => {
  assert.deepEqual(await requestUnbiseoParse({ text: '   ', today: '2026-10-22', clientNames: [] }), { kind: 'error', message: BAD_INPUT })
  assert.deepEqual(await requestUnbiseoParse({ text: '가'.repeat(301), today: '2026-10-22', clientNames: [] }), { kind: 'error', message: BAD_INPUT })
  assert.equal(calls.length, 0)
})

test('실패 문구: 401 로그인, 400 다시 말하기, 502 알아듣지 못함, 503·연결 끊김·던짐은 잠시 뒤', async () => {
  /** @type {Array<[Error, string]>} */
  const cases = [
    [httpError(401), LOGIN_NEEDED],
    [httpError(400), BAD_INPUT],
    [httpError(502), NOT_UNDERSTOOD],
    [httpError(503), TRY_LATER],
    [new FunctionsFetchError({}), TRY_LATER],
  ]
  for (const [error, message] of cases) {
    reply = async () => ({ data: null, error })
    assert.deepEqual(await requestUnbiseoParse({ text: '평택 용인', today: '2026-10-22', clientNames: [] }), { kind: 'error', message })
  }
  reply = async () => { throw new Error('network') }
  assert.deepEqual(await requestUnbiseoParse({ text: '평택 용인', today: '2026-10-22', clientNames: [] }), { kind: 'error', message: TRY_LATER })
})

test('결과 문장: 오늘이면 "오늘", 빈 칸은 빼고, 끝 글자 받침에 따라 "으로"/"로"', async () => {
  const { describeCall, describeResult } = await import('./unbiseoSentence.ts')
  const today = '2026-10-22'
  assert.equal(describeCall({ date: today, loadLoc: '평택', unloadLoc: '용인', fare: 300000, client: '한진' }, today), '오늘 평택 → 용인, 300,000원, 한진으로 기록할게요.')
  assert.equal(describeCall({ date: today, loadLoc: '인천', unloadLoc: '부산', fare: 450000, client: '롯데' }, today), '오늘 인천 → 부산, 450,000원, 롯데로 기록할게요.')
  assert.equal(describeCall({ date: '2026-10-21', loadLoc: '수원', unloadLoc: '화성', fare: 150000, client: '' }, today), '10월 21일 수원 → 화성, 150,000원으로 기록할게요.')
  assert.equal(describeCall({ date: today, loadLoc: '평택', unloadLoc: '', fare: null, client: '' }, today), '오늘 평택으로 기록할게요.')
  assert.equal(describeCall({ date: today, loadLoc: '', unloadLoc: '', fare: null, client: '' }, today), '오늘 운행으로 기록할게요.')
  /** @type {import('./unbiseoQuestion.ts').UnbiseoQuestion} */
  const question = { type: 'trips', period: { unit: 'month', value: '2026-10' }, client: '', expenseType: '' }
  assert.equal(describeResult({ kind: 'question', question }, today, (asked) => `답 ${asked.type}`), '답 trips', '질문 답은 숫자를 내는 쪽이 만든다')
  assert.equal(describeResult({ kind: 'unknown' }, today, () => ''), '운행 기록으로 알아듣지 못했어요. 다시 말해 주세요.')
  assert.equal(describeResult({ kind: 'error', message: TRY_LATER }, today, () => ''), TRY_LATER)
})

// 로드맵 24-F-2 — 고정 노선: 노선 이름 보내기, 답 읽기(횟수 1~20·노선 60자), 문장.
test('고정 노선 이름: 일지 칩과 같은 "상차지 → 하차지", 빈 칸·61자·겹침 빼고 30개까지, 없으면 보내지 않음', async () => {
  assert.deepEqual(routeNamesForAi([{ loadLoc: '평택', unloadLoc: '용인' }, { loadLoc: '평택', unloadLoc: '용인' }, { loadLoc: '', unloadLoc: '오산' }, { loadLoc: 'ㄱ'.repeat(30), unloadLoc: 'ㄴ'.repeat(28) }, { loadLoc: '화성', unloadLoc: '오산' }]), ['평택 → 용인', '화성 → 오산'])
  assert.equal(routeNamesForAi(Array.from({ length: 40 }, (_, i) => ({ loadLoc: `가${i}`, unloadLoc: '나' }))).length, 30)
  reply = async () => ({ data: { kind: 'fixed', fixed: { date: '2026-10-22', count: 2, route: '평택 → 용인' } }, error: null })
  const result = await requestUnbiseoParse({ text: '평택 용인 고정 2번', today: '2026-10-22', clientNames: [], routeNames: ['평택 → 용인'] })
  assert.deepEqual(calls[0].body, { text: '평택 용인 고정 2번', today: '2026-10-22', clientNames: [], routeNames: ['평택 → 용인'] })
  assert.deepEqual(result, { kind: 'fixed', fixed: { date: '2026-10-22', count: 2, route: '평택 → 용인' } })
  await requestUnbiseoParse({ text: '오늘 고정 3번', today: '2026-10-22', clientNames: [], routeNames: [] })
  assert.deepEqual(calls[1].body, { text: '오늘 고정 3번', today: '2026-10-22', clientNames: [] }, '빈 목록이면 칸 없이')
})

test('고정 노선 답이 이상하면 고쳐 담는다: 횟수 1~20 정수 아니면 1, 노선 61자는 빈 칸, 날짜 모양 아니면 오늘, 칸이 없으면 알아듣지 못함', async () => {
  const read = async (/** @type {JsonValue} */ fixed) => { reply = async () => ({ data: { kind: 'fixed', fixed }, error: null }); return requestUnbiseoParse({ text: '고정', today: '2026-10-22', clientNames: [] }) }
  for (const [said, want] of [[1, 1], [20, 20], [0, 1], [21, 1], [2.5, 1], ['3', 1], [null, 1]]) {
    assert.deepEqual(await read({ date: '2026-10-21', count: said, route: '' }), { kind: 'fixed', fixed: { date: '2026-10-21', count: want, route: '' } }, String(said))
  }
  assert.deepEqual(await read({ date: '어제', count: 3, route: 'ㄱ'.repeat(61) }), { kind: 'fixed', fixed: { date: '2026-10-22', count: 3, route: '' } })
  assert.deepEqual(await read({ route: ' 평택 → 용인 ' }), { kind: 'fixed', fixed: { date: '2026-10-22', count: 1, route: '평택 → 용인' } })
  reply = async () => ({ data: { kind: 'fixed' }, error: null })
  assert.deepEqual(await requestUnbiseoParse({ text: '고정', today: '2026-10-22', clientNames: [] }), { kind: 'error', message: NOT_UNDERSTOOD })
})

test('고정 노선 문장: "{오늘|M월 D일} {노선|고정 노선} n회로 기록할게요."', () => {
  assert.equal(describeFixed({ date: '2026-10-22', count: 2, route: '평택 → 용인' }, '2026-10-22'), '오늘 평택 → 용인 2회로 기록할게요.')
  assert.equal(describeFixed({ date: '2026-10-21', count: 3, route: '' }, '2026-10-22'), '10월 21일 고정 노선 3회로 기록할게요.')
})

// 로드맵 24-G-2 — 거래처 등록 답 읽기: 이름은 꼭(50자), 그 밖은 서버(24-G-1)와 같은 범위 안일 때만.
test('거래처 답: 칸을 그대로 담고, 이름이 없거나 51자·칸이 없으면 알아듣지 못함', async () => {
  const C0 = { name: '한진', manager: '', phone: '', paymentTerm: '', paymentTermValue: null, commType: '', commValue: null }
  const read = async (/** @type {JsonValue} */ client) => { reply = async () => ({ data: { kind: 'client', client }, error: null }); return requestUnbiseoParse({ text: '거래처 등록', today: '2026-10-23', clientNames: [] }) }
  assert.deepEqual(await read({ name: '한진', manager: '김철수', phone: '010-1234-5678', paymentTerm: 'next_month_end', paymentTermValue: null, commType: 'percent', commValue: 5 }),
    { kind: 'client', client: { name: '한진', manager: '김철수', phone: '010-1234-5678', paymentTerm: 'next_month_end', paymentTermValue: null, commType: 'percent', commValue: 5 } })
  assert.deepEqual(await read({ name: ' 한진 ' }), { kind: 'client', client: C0 })
  for (const name of ['', 'ㄱ'.repeat(51), 5]) assert.deepEqual(await read({ name }), { kind: 'error', message: NOT_UNDERSTOOD }, String(name))
  reply = async () => ({ data: { kind: 'client' }, error: null })
  assert.deepEqual(await requestUnbiseoParse({ text: '거래처 등록', today: '2026-10-23', clientNames: [] }), { kind: 'error', message: NOT_UNDERSTOOD })
})

test('거래처 답 이상한 칸은 빈 칸: 담당자 31자, 연락처 자리수, 결제 주기 목록 밖·값 범위, 수수료 범위', async () => {
  const read = async (/** @type {{ [key: string]: JsonValue }} */ fields) => { reply = async () => ({ data: { kind: 'client', client: { name: '한진', ...fields } }, error: null }); const r = await requestUnbiseoParse({ text: '거래처 등록', today: '2026-10-23', clientNames: [] }); assert.equal(r.kind, 'client'); return r.kind === 'client' ? r.client : null }
  assert.equal((await read({ manager: 'ㄱ'.repeat(31) }))?.manager, '')
  assert.equal((await read({ phone: '(031)123-4567' }))?.phone, '031123-4567')
  for (const phone of ['12345678', '01012345678901']) assert.equal((await read({ phone }))?.phone, '', phone)
  assert.equal((await read({ paymentTerm: 'monthly' }))?.paymentTerm, '')
  assert.equal((await read({ paymentTerm: 'after_days', paymentTermValue: 365 }))?.paymentTermValue, 365)
  assert.equal((await read({ paymentTerm: 'after_days', paymentTermValue: 366 }))?.paymentTermValue, null)
  assert.equal((await read({ paymentTerm: 'next_month_end', paymentTermValue: 10 }))?.paymentTermValue, null, '값이 필요 없는 주기')
  for (const [commType, commValue] of /** @type {Array<[JsonValue, JsonValue]>} */ ([['percent', 101], ['direct', 10.5], ['fixed', 1000], ['percent', '5']])) {
    const got = await read({ commType, commValue })
    assert.deepEqual([got?.commType, got?.commValue], ['', null], `${commType} ${commValue}`)
  }
})

// 로드맵 24-H-2 — 미수금 문자 답 읽기(칸 검사는 unbiseoSms.test.js).
test('문자 답: sms 칸을 읽고, 칸이 없으면 알아듣지 못함', async () => {
  reply = async () => ({ data: { kind: 'sms', sms: { client: '한진', month: '2026-07', all: false, template: 1 } }, error: null })
  assert.deepEqual(await requestUnbiseoParse({ text: '한진 7월분 미수금 문자', today: '2026-10-23', clientNames: [] }), { kind: 'sms', sms: { client: '한진', month: '2026-07', all: false, template: 1 } })
  reply = async () => ({ data: { kind: 'sms' }, error: null })
  assert.deepEqual(await requestUnbiseoParse({ text: '미수금 문자', today: '2026-10-23', clientNames: [] }), { kind: 'error', message: NOT_UNDERSTOOD })
})
