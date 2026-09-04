// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { buildSubLogMenuItems } from './subLogMenuItems.js'

describe('buildSubLogMenuItems — §5-4 B안', () => {
  test('logEnabled 없는 sub도 포함하고 축약 라벨을 붙인다', () => {
    const items = buildSubLogMenuItems([
      { id: 'm', type: 'main', number: '서울00가0000' },
      { id: 's1', type: 'sub', number: '서울12가3456' },
      { id: 's2', type: 'sub', number: '부산33나1111', logEnabled: false },
      { id: 's3', type: 'sub', number: '  ' },
    ], true)
    assert.deepEqual(items, [
      { number: '서울12가3456', label: '3456' },
      { number: '부산33나1111', label: '1111' },
    ])
  })

  test('소속기사 세션(isOwnerSession=false)이면 빈 배열', () => {
    const items = buildSubLogMenuItems([
      { id: 's1', type: 'sub', number: '서울12가3456', logEnabled: true },
    ], false)
    assert.deepEqual(items, [])
  })
})
