import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roundCurrencyText } from './money.js'

test('소수점은 반올림한 쉼표 정수 글자로(로드맵 43)', () => {
  assert.equal(roundCurrencyText('12345.6'), '12,346')
  assert.equal(roundCurrencyText('12,345.4'), '12,345')
  assert.equal(roundCurrencyText('12,345.5'), '12,346')
  assert.equal(roundCurrencyText('1000.5'), '1,001')
})

test('점이 없으면 지금 금액 칸과 같다, 점은 결과에 절대 없다', () => {
  assert.equal(roundCurrencyText('100000'), '100,000')
  assert.equal(roundCurrencyText('12,345.'), '12,345')
  assert.equal(roundCurrencyText('1.2.3'), '1')
  for (const input of ['12345.6', '9.99', '0.5', '1.2.3']) assert.equal(roundCurrencyText(input).includes('.'), false, input)
})

test('빈 값·0은 빈 글자', () => {
  assert.equal(roundCurrencyText(''), '')
  assert.equal(roundCurrencyText(undefined), '')
  assert.equal(roundCurrencyText('0.4'), '')
  assert.equal(roundCurrencyText('abc'), '')
})
