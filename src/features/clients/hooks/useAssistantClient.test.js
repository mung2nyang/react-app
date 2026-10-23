// @ts-check
// 로드맵 24-G-2 — 주소 상태로 넘어온 운비서 거래처 칸 검사: 이름은 꼭, 그 밖은 틀린 칸만 뺀다(등록 창 기본값이 남음).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readAssistantClient } from './useAssistantClient.js'

/** @param {object} fields */
const read = (fields) => readAssistantClient({ from: 'home', assistantClient: { name: '한진', manager: '', phone: '', paymentTerm: '', paymentTermValue: null, commType: '', commValue: null, ...fields } })

test('전부 맞으면 등록 창 칸으로 — 연락처는 하이픈 형식, 결제 주기 값·수수료 값은 글자', () => {
  assert.deepEqual(read({ manager: '김철수', phone: '01012345678', paymentTerm: 'next_month_day', paymentTermValue: 10, commType: 'percent', commValue: 5 }), {
    companyName: '한진', managerName: '김철수', phone: '010-1234-5678',
    paymentTerm: 'next_month_day', paymentTermValue: '10', commEnabled: true, commType: 'percent', commValue: '5',
  })
  assert.deepEqual(read({ paymentTerm: 'next_month_end', commType: 'direct', commValue: 10000 }), {
    companyName: '한진', managerName: '', paymentTerm: 'next_month_end', paymentTermValue: '', commEnabled: true, commType: 'direct', commValue: '10000',
  })
})

test('이름만이면 이름·담당자 빈 칸만(결제 주기·수수료는 창 기본값)', () => {
  assert.deepEqual(read({}), { companyName: '한진', managerName: '' })
})

test('이름이 없거나 51자, 모양이 틀리면 null', () => {
  assert.equal(read({ name: '' }), null)
  assert.equal(read({ name: '  ' }), null)
  assert.equal(read({ name: 'ㄱ'.repeat(51) }), null)
  assert.equal(read({ name: 5 }), null)
  assert.equal(readAssistantClient({ from: 'home' }), null)
  assert.equal(readAssistantClient(null), null)
  assert.equal(readAssistantClient({ assistantClient: ['한진'] }), null)
})

test('틀린 칸만 뺀다 — 담당자 31자, 연락처 자리수, 목록 밖·값 틀린 결제 주기, 범위 밖 수수료', () => {
  assert.equal(read({ manager: 'ㄱ'.repeat(31) })?.managerName, '')
  for (const phone of ['12345678', '01012345678901', '공일공']) assert.equal(read({ phone })?.phone, undefined, phone)
  assert.equal(read({ paymentTerm: 'monthly' })?.paymentTerm, undefined)
  assert.equal(read({ paymentTerm: 'after_days', paymentTermValue: 366 })?.paymentTerm, undefined, '값이 틀리면 주기도 빼서 기본값')
  assert.equal(read({ paymentTerm: 'next_month_day', paymentTermValue: 32 })?.paymentTerm, undefined)
  assert.equal(read({ paymentTerm: 'next_month_day', paymentTermValue: null })?.paymentTerm, undefined)
  assert.deepEqual([read({ paymentTerm: 'after_days', paymentTermValue: 365 })?.paymentTermValue], ['365'])
  for (const [commType, commValue] of [['percent', 101], ['percent', -1], ['direct', 10.5], ['fixed', 1000], ['percent', '5'], ['', 5]]) {
    assert.equal(read({ commType, commValue })?.commEnabled, undefined, `${commType} ${commValue}`)
  }
  assert.equal(read({ commType: 'percent', commValue: 3.3 })?.commValue, '3.3')
})
