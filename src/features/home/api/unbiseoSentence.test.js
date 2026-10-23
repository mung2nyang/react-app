// @ts-check
// 로드맵 24-G-2 — 거래처 등록 문장: 들은 칸만 괄호 안에(연락처·결제 주기는 거래처 창과 같은 표시), 이미 있는 이름 문장.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeClient, describeExistingClient, describeResult } from './unbiseoSentence.ts'

/** @typedef {import('./unbiseoParse.ts').UnbiseoClient} UnbiseoClient */

/** @param {Partial<UnbiseoClient>} fields @returns {UnbiseoClient} */
const client = (fields) => ({ name: '한진', manager: '', phone: '', paymentTerm: '', paymentTermValue: null, commType: '', commValue: null, ...fields })

test('전부 들으면 담당자·연락처·결제 주기·수수료(%)를 괄호 안에', () => {
  assert.equal(
    describeClient(client({ manager: '김철수', phone: '01012345678', paymentTerm: 'next_month_end', commType: 'percent', commValue: 5 })),
    '한진을 거래처로 등록할게요. (담당자 김철수, 010-1234-5678, 익월 말일 정산, 수수료 5%)',
  )
})

test('이름만이면 괄호 없이, 받침 없는 이름은 "를"', () => {
  assert.equal(describeClient(client({})), '한진을 거래처로 등록할게요.')
  assert.equal(describeClient(client({ name: '롯데' })), '롯데를 거래처로 등록할게요.')
  assert.equal(describeClient(client({ name: 'CJ' })), 'CJ를 거래처로 등록할게요.')
})

test('결제 주기 값·건당 금액 수수료, 빈 칸은 뺀다', () => {
  assert.equal(describeClient(client({ name: '롯데', paymentTerm: 'next_month_day', paymentTermValue: 10 })), '롯데를 거래처로 등록할게요. (익월 10일 정산)')
  assert.equal(
    describeClient(client({ name: '씨제이', paymentTerm: 'after_days', paymentTermValue: 30, commType: 'direct', commValue: 10000 })),
    '씨제이를 거래처로 등록할게요. (운행 건별 30일 후 정산, 수수료 10,000원)',
  )
  assert.equal(describeClient(client({ phone: '02-123-4567' })), '한진을 거래처로 등록할게요. (021-234-567)', '연락처는 거래처 창과 같은 표시')
})

test('결과 문장에서 거래처, 이미 있는 이름', () => {
  assert.equal(describeResult({ kind: 'client', client: client({ manager: '김철수' }) }, '2026-10-23', () => ''), '한진을 거래처로 등록할게요. (담당자 김철수)')
  assert.equal(describeExistingClient('한진'), '한진은 이미 등록된 거래처예요.')
  assert.equal(describeExistingClient('롯데'), '롯데는 이미 등록된 거래처예요.')
})

// 추가 수정 — 날짜가 필요한 주기인데 날짜가 없으면 카드 문장에서 결제 주기를 뺀다(등록 창도 기본값으로 엶).
test('날짜 없는 지정일·N일 후 주기는 문장에서 빼고, 날짜가 있거나 말일·당일이면 그대로', () => {
  assert.equal(describeClient(client({ name: '롯데', paymentTerm: 'next_month_day' })), '롯데를 거래처로 등록할게요.')
  assert.equal(describeClient(client({ name: '롯데', paymentTerm: 'second_month_day' })), '롯데를 거래처로 등록할게요.')
  assert.equal(describeClient(client({ name: '롯데', paymentTerm: 'after_days', manager: '김철수' })), '롯데를 거래처로 등록할게요. (담당자 김철수)')
  assert.equal(describeClient(client({ name: '롯데', paymentTerm: 'next_month_day', paymentTermValue: 10 })), '롯데를 거래처로 등록할게요. (익월 10일 정산)')
  assert.equal(describeClient(client({ name: '롯데', paymentTerm: 'second_month_end' })), '롯데를 거래처로 등록할게요. (익익월 말일 정산)')
  assert.equal(describeClient(client({ name: '롯데', paymentTerm: 'same_day' })), '롯데를 거래처로 등록할게요. (당일/수시 정산)')
})
