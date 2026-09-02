import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { findCallDetailIndex, resolveCallDetailId } from './callDetailIds.js'
import { getReceivableItems } from './finance.js'
import { FIXTURE_DETAIL_ID_MAY10_MAIN, FIXTURE_SETTINGS, FIXTURE_WORK } from './finance.fixtures.js'
import { addPartialPayment } from './payments.js'
import { receivableItemKey } from './receivables.js'

describe('callDetailIds — detailId 조회', () => {
  test('resolveCallDetailId는 문자열 id를 그대로 돌려준다', () => {
    assert.equal(resolveCallDetailId({ id: 'trp-abc' }), 'trp-abc')
  })

  test('숫자 id는 문자열로 고친 뒤 반환한다', () => {
    assert.equal(resolveCallDetailId({ id: 42 }), '42')
  })

  test('id 없으면 빈 문자열', () => {
    assert.equal(resolveCallDetailId({ fare: '1' }), '')
  })

  test('findCallDetailIndex는 배열 순서와 무관하게 id로 찾는다', () => {
    const details = [
      { id: 'trp-first', fare: '1' },
      { id: 'trp-second', fare: '2' },
    ]
    const reordered = [details[1], details[0]]
    assert.equal(findCallDetailIndex(reordered, 'trp-second'), 0)
    assert.equal(findCallDetailIndex(reordered, 'trp-first'), 1)
  })
})

describe('미수 키 — detailId 마이그레이션', () => {
  test('getReceivableItems는 detailId를보내고 detailIndex는 없다', () => {
    const items = getReceivableItems(FIXTURE_SETTINGS, FIXTURE_WORK)
    assert.ok(items.length > 0)
    items.forEach((item) => {
      assert.equal(typeof item.detailId, 'string')
      assert.ok(item.detailId.length > 0)
      assert.equal('detailIndex' in item, false)
    })
  })

  test('receivableItemKey는 detailId를 쓴다', () => {
    const item = getReceivableItems(FIXTURE_SETTINGS, FIXTURE_WORK)[0]
    assert.equal(receivableItemKey(item), `${item.logId}|${item.dateKey}|${item.detailId}`)
  })

  test('앞 항목을 삭제해도 detailId로 부분입금이 같은 건에 적용된다', () => {
    const dateKey = '2026-05-10'
    const main = structuredClone(FIXTURE_WORK.main)
    const target = main[dateKey].callDetails.find((item) => item.id === FIXTURE_DETAIL_ID_MAY10_MAIN)
    assert.ok(target)
    main[dateKey].callDetails = main[dateKey].callDetails.filter((item) => item.id !== 'trp-fixture-may10-1')
    const result = addPartialPayment(main, dateKey, FIXTURE_DETAIL_ID_MAY10_MAIN, '10,000')
    assert.equal(result.error, undefined)
    const patched = result.data[dateKey].callDetails.find((item) => item.id === FIXTURE_DETAIL_ID_MAY10_MAIN)
    assert.equal(patched?.payments?.length, 1)
  })
})
