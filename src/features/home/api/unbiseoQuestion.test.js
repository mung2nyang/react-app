// @ts-check
// 로드맵 24-D-2 — 운비서 질문 읽기와 답 문장 틀(숫자는 받기만).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ASK_BY_MONTH, CANNOT_ANSWER, CLIENT_ONLY_SALES, describeQuestion, readQuestion } from './unbiseoQuestion.ts'

/** @typedef {import('./unbiseoQuestion.ts').UnbiseoQuestion} UnbiseoQuestion */
/** @typedef {import('./unbiseoQuestion.ts').QuestionNumbers} QuestionNumbers */

const TODAY = '2026-10-23'
const OCT = /** @type {const} */ ({ unit: 'month', value: '2026-10' })

/** @param {Partial<UnbiseoQuestion>} fields @returns {UnbiseoQuestion} */
const q = (fields) => ({ type: 'revenue', period: OCT, client: '', expenseType: '', ...fields })
/** @param {Partial<QuestionNumbers>} [numbers] */
const numbers = (numbers = {}) => () => ({ amount: 0, count: 0, supply: 0, ...numbers })

test('질문 칸 읽기: 그대로 담고, 목록 밖 종류는 그 밖, 틀린 기간은 이번 달(미수금은 전체), 지출 종류는 지출 질문일 때만', () => {
  assert.deepEqual(readQuestion({ type: 'expense', period: { unit: 'month', value: '2026-09' }, client: ' 한진 ', expenseType: 'fuel' }, TODAY), { type: 'expense', period: { unit: 'month', value: '2026-09' }, client: '한진', expenseType: 'fuel' })
  assert.deepEqual(readQuestion({ type: 'unpaid', period: { unit: 'all' }, client: '', expenseType: '' }, TODAY), { type: 'unpaid', period: { unit: 'all' }, client: '', expenseType: '' })
  assert.deepEqual(readQuestion({ type: 'revenue', period: { unit: 'year', value: '2025' } }, TODAY).period, { unit: 'year', value: '2025' })
  assert.deepEqual(readQuestion({ type: 'revenue', period: { unit: 'unsupported' } }, TODAY).period, { unit: 'unsupported' })
  assert.equal(readQuestion({ type: 'average' }, TODAY).type, 'other')
  assert.equal(readQuestion({}, TODAY).type, 'other')
  /** @type {Array<import('../../../domain/jsonTypes.ts').JsonValue>} */
  const oddPeriods = [{ unit: 'month', value: '2026-13' }, { unit: 'year', value: '26' }, { unit: 'week' }, null, '2026-10']
  for (const period of oddPeriods) {
    assert.deepEqual(readQuestion({ type: 'revenue', period }, TODAY).period, OCT, JSON.stringify(period))
    assert.deepEqual(readQuestion({ type: 'unpaid', period }, TODAY).period, { unit: 'all' }, JSON.stringify(period))
  }
  assert.equal(readQuestion({ type: 'revenue', expenseType: 'fuel' }, TODAY).expenseType, '')
  assert.equal(readQuestion({ type: 'expense', expenseType: 'toll' }, TODAY).expenseType, '')
  assert.equal(readQuestion({ type: 'unpaid', client: 3 }, TODAY).client, '')
})

test('답 문장 — 차주: 매출·순이익·지출(종류별)·운행 횟수, 기간 이름은 이번 해면 "10월", 다른 해면 "2025년 9월", 연이면 "2026년"', () => {
  assert.equal(describeQuestion(q({}), TODAY, false, numbers({ amount: 1234000 })), '10월 매출은 1,234,000원입니다.')
  assert.equal(describeQuestion(q({ period: { unit: 'month', value: '2025-09' } }), TODAY, false, numbers({ amount: 5000 })), '2025년 9월 매출은 5,000원입니다.')
  assert.equal(describeQuestion(q({ period: { unit: 'year', value: '2026' } }), TODAY, false, numbers({ amount: 0 })), '2026년 매출은 0원입니다.')
  assert.equal(describeQuestion(q({ type: 'netProfit' }), TODAY, false, numbers({ amount: -30000 })), '10월 순이익은 -30,000원입니다.')
  assert.equal(describeQuestion(q({ type: 'expense' }), TODAY, false, numbers({ amount: 138000 })), '10월 지출은 138,000원입니다.')
  assert.equal(describeQuestion(q({ type: 'expense', expenseType: 'fuel' }), TODAY, false, numbers({ amount: 80000 })), '10월 주유비는 80,000원입니다.')
  assert.equal(describeQuestion(q({ type: 'expense', expenseType: 'maint' }), TODAY, false, numbers({ amount: 50000 })), '10월 정비비는 50,000원입니다.')
  assert.equal(describeQuestion(q({ type: 'expense', expenseType: 'misc' }), TODAY, false, numbers({ amount: 8000 })), '10월 기타 지출은 8,000원입니다.')
  assert.equal(describeQuestion(q({ type: 'trips' }), TODAY, false, numbers({ count: 25 })), '10월 운행은 25회입니다.')
})

test('답 문장 — 연동 기사는 기사 매출 화면 이름(운송 수입·정산액)', () => {
  assert.equal(describeQuestion(q({}), TODAY, true, numbers({ amount: 450000 })), '10월 운송 수입(정산 전)은 450,000원입니다.')
  assert.equal(describeQuestion(q({ type: 'netProfit' }), TODAY, true, numbers({ amount: 67078 })), '10월 정산액은 67,078원입니다.')
  assert.equal(describeQuestion(q({ type: 'trips' }), TODAY, true, numbers({ count: 2 })), '10월 운행은 2회입니다.')
})

test('답 문장 — 미수금: 전체·거래처·달·0원', () => {
  const unpaid = q({ type: 'unpaid', period: { unit: 'all' } })
  assert.equal(describeQuestion(unpaid, TODAY, false, numbers({ amount: 300000, count: 2 })), '남은 미수금은 300,000원입니다(2건).')
  assert.equal(describeQuestion({ ...unpaid, client: '한진' }, TODAY, false, numbers({ amount: 300000, count: 2 })), '한진 남은 미수금은 300,000원입니다(2건).')
  assert.equal(describeQuestion({ ...unpaid, period: OCT }, TODAY, false, numbers({ amount: 100000, count: 1 })), '10월 운행분 남은 미수금은 100,000원입니다(1건).')
  assert.equal(describeQuestion({ ...unpaid, client: '한진', period: OCT }, TODAY, false, numbers({ amount: 100000, count: 1 })), '한진 10월 운행분 남은 미수금은 100,000원입니다(1건).')
  // 기사 차량 운행분이 섞이면 범위를 밝힌다(매출 답은 차주 탭 = 메인만).
  assert.equal(describeQuestion(unpaid, TODAY, false, numbers({ amount: 3309258, count: 14, withSub: true })), '남은 미수금은 3,309,258원입니다(기사 차량 포함, 14건).')
  assert.equal(describeQuestion({ ...unpaid, client: '한진', period: OCT }, TODAY, false, numbers({ amount: 100000, count: 1, withSub: true })), '한진 10월 운행분 남은 미수금은 100,000원입니다(기사 차량 포함, 1건).')
  assert.equal(describeQuestion(unpaid, TODAY, false, numbers({ amount: 0, count: 0, withSub: false })), '남은 미수금이 없습니다.')
  assert.equal(describeQuestion(unpaid, TODAY, false, numbers()), '남은 미수금이 없습니다.')
  assert.equal(describeQuestion({ ...unpaid, client: '한진' }, TODAY, false, numbers()), '한진 남은 미수금이 없습니다.')
})

test('답 문장 — 거래처 매출: 공급가액·부가세 포함, 운행이 없으면 없음', () => {
  assert.equal(describeQuestion(q({ client: '한진' }), TODAY, false, numbers({ supply: 400000, amount: 440000, count: 3 })), '한진 10월 매출은 공급가액 400,000원, 부가세 포함 440,000원입니다.')
  assert.equal(describeQuestion(q({ client: '한진', period: { unit: 'year', value: '2026' } }), TODAY, false, numbers({ supply: 1000, amount: 1100, count: 1 })), '한진 2026년 매출은 공급가액 1,000원, 부가세 포함 1,100원입니다.')
  assert.equal(describeQuestion(q({ client: '롯데' }), TODAY, false, numbers()), '롯데 10월 매출이 없습니다.')
})

test('숫자 없이 답하는 경우는 숫자를 내지 않는다: 그 밖·짧은 기간·미수금 아닌 전체 기간·거래처로 못 나누는 질문', () => {
  let asked = 0
  const counted = () => { asked += 1; return { amount: 1, count: 1, supply: 1 } }
  assert.equal(describeQuestion(q({ type: 'other' }), TODAY, false, counted), CANNOT_ANSWER)
  assert.equal(describeQuestion(q({ period: { unit: 'unsupported' } }), TODAY, false, counted), ASK_BY_MONTH)
  assert.equal(describeQuestion(q({ type: 'unpaid', period: { unit: 'unsupported' } }), TODAY, false, counted), ASK_BY_MONTH)
  assert.equal(describeQuestion(q({ period: { unit: 'all' } }), TODAY, false, counted), ASK_BY_MONTH)
  for (const type of /** @type {const} */ (['netProfit', 'expense', 'trips'])) {
    assert.equal(describeQuestion(q({ type, client: '한진' }), TODAY, false, counted), CLIENT_ONLY_SALES, type)
  }
  assert.equal(asked, 0)
  assert.equal(ASK_BY_MONTH, '달이나 연으로 물어봐 주세요. 예: 이번 달 매출 얼마야')
  assert.equal(CANNOT_ANSWER, '아직 답할 수 없는 질문이에요. 매출·순이익·지출·미수금·운행 횟수를 물어봐 주세요.')
  assert.equal(CLIENT_ONLY_SALES, '거래처별로는 매출과 미수금만 답할 수 있어요.')
})
