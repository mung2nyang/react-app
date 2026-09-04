// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { buildSubLogMenuItems } from './subLogMenuItems.js'

describe('buildSubLogMenuItems — §1-A 연동 없는 sub만', () => {
  test('연동·초대대기 기사가 있는 sub는 빼고, 없는 sub만 남긴다', () => {
    const items = buildSubLogMenuItems([
      { id: 'm', type: 'main', number: '서울00가0000' },
      { id: 's1', type: 'sub', number: '서울12가3456' },
      { id: 's2', type: 'sub', number: '부산33나1111' },
      { id: 's3', type: 'sub', number: '대구44다2222' },
      { id: 's4', type: 'sub', number: '  ' },
    ], [
      { id: 'd1', status: 'linked', vehicleNumber: '서울12가3456' },
      { id: 'd2', status: 'pending', vehicleNumber: '부산33나1111' },
      { id: 'd3', status: /** @type {any} */ ('disconnected'), vehicleNumber: '대구44다2222' },
    ], true)
    assert.deepEqual(items, [
      { number: '대구44다2222', label: '2222' },
    ])
  })

  test('기사가 없으면 모든 유효 sub를 포함한다', () => {
    const items = buildSubLogMenuItems([
      { id: 's1', type: 'sub', number: '서울12가3456' },
      { id: 's2', type: 'sub', number: '부산33나1111', logEnabled: false },
    ], [], true)
    assert.deepEqual(items, [
      { number: '서울12가3456', label: '3456' },
      { number: '부산33나1111', label: '1111' },
    ])
  })

  test('소속기사 세션(isOwnerSession=false)이면 빈 배열', () => {
    const items = buildSubLogMenuItems([
      { id: 's1', type: 'sub', number: '서울12가3456' },
    ], [], false)
    assert.deepEqual(items, [])
  })
})
