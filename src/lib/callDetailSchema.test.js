// @ts-check
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isValidCallDetail, isValidCurrencyAmount } from './callDetailSchema.js'

/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
/** @typedef {import('./pendingWorkDataWritesTypes.js').EffectiveCallDetail} EffectiveCallDetail */

/** @param {string|number} amount @returns {EffectiveCallDetail} */
function detailWithAmount(amount) {
  return { id: 'trp_currency', fare: '1,000', payments: [{ amount }] }
}

test('재감사 12차 — 통화는 천 단위 쉼표 또는 쉼표 없는 정수만 허용하고 잘못된 구문은 거부한다', () => {
  assert.equal(isValidCurrencyAmount(0), true)
  assert.equal(isValidCurrencyAmount(1000), true)
  assert.equal(isValidCurrencyAmount('1000'), true)
  assert.equal(isValidCurrencyAmount('1,000'), true)
  assert.equal(isValidCurrencyAmount('1,000원'), true)
  assert.equal(isValidCurrencyAmount('1,000 원'), true)
  assert.equal(isValidCurrencyAmount(' 1,000 '), true)

  assert.equal(isValidCurrencyAmount(''), false)
  assert.equal(isValidCurrencyAmount('   '), false)
  assert.equal(isValidCurrencyAmount(','), false)
  assert.equal(isValidCurrencyAmount('.'), false)
  assert.equal(isValidCurrencyAmount('원'), false)
  assert.equal(isValidCurrencyAmount('1.2.3'), false)
  assert.equal(isValidCurrencyAmount('1,,000'), false)
  assert.equal(isValidCurrencyAmount('1,00'), false)
  assert.equal(isValidCurrencyAmount('1 0 0'), false)
  assert.equal(isValidCurrencyAmount('1,000.50'), false)
  assert.equal(isValidCurrencyAmount('oops'), false)
  assert.equal(isValidCurrencyAmount(-1), false)
  assert.equal(isValidCurrencyAmount(Number.NaN), false)
  assert.equal(isValidCurrencyAmount(Number.POSITIVE_INFINITY), false)
  assert.equal(isValidCurrencyAmount({ nested: 1 }), false)

  assert.equal(isValidCallDetail(detailWithAmount('1,000')), true)
  assert.equal(isValidCallDetail(detailWithAmount('1,000원')), true)
  assert.equal(isValidCallDetail(detailWithAmount(1000)), true)
  assert.equal(isValidCallDetail(detailWithAmount('1,00')), false)
  assert.equal(isValidCallDetail(detailWithAmount('1,000.50')), false)
  /** @type {JsonValue} */
  const nestedAmount = { nested: 1 }
  assert.equal(isValidCallDetail({
    id: 'trp_currency',
    fare: '1,000',
    payments: [{ amount: nestedAmount }],
  }), false)
})
