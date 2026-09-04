// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getAssignmentState } from './drivers.js'

describe('getAssignmentState', () => {
  test('시작일이 미래면 할당 예정', () => {
    assert.deepEqual(
      getAssignmentState({ assignmentStart: '2099-01-01', assignmentEnd: '' }),
      { key: 'scheduled', label: '할당 예정' },
    )
  })

  test('종료일이 과거면 할당 종료', () => {
    assert.deepEqual(
      getAssignmentState({ assignmentStart: '2020-01-01', assignmentEnd: '2020-06-30' }),
      { key: 'ended', label: '할당 종료' },
    )
  })

  test('기간 안이면 할당 중 (DriverRecord startDate/endDate도 동일)', () => {
    assert.deepEqual(
      getAssignmentState({ startDate: '2020-01-01', endDate: '' }),
      { key: 'active', label: '할당 중' },
    )
  })
})
