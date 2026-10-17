// @ts-check
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { checkDriverDraft, getAssignmentState } from './drivers.js'

describe('getAssignmentState', () => {
  test('시작일이 미래면 할당 예정', () => {
    assert.deepEqual(
      getAssignmentState({ assignmentStart: '2099-01-01', assignmentEnd: '' }),
      { key: 'scheduled', label: '배정 예정' },
    )
  })

  test('종료일이 과거면 할당 종료', () => {
    assert.deepEqual(
      getAssignmentState({ assignmentStart: '2020-01-01', assignmentEnd: '2020-06-30' }),
      { key: 'ended', label: '배정 종료' },
    )
  })

  test('기간 안이면 할당 중 (DriverRecord startDate/endDate도 동일)', () => {
    assert.deepEqual(
      getAssignmentState({ startDate: '2020-01-01', endDate: '' }),
      { key: 'active', label: '배정 중' },
    )
  })
})

describe('checkDriverDraft — 로드맵 82-B 어느 칸이 문제인지', () => {
  const base = { name: '김기사', phone: '010-1234-5678', inviteCode: 'ABCDE23456', vehicleNumber: '', startDate: '', endDate: '' }

  test('이름 → 전화번호 → 초대 코드 순서', () => {
    assert.equal(checkDriverDraft({ ...base, name: '' })?.field, 'name')
    assert.deepEqual(checkDriverDraft({ ...base, phone: '010' }), { field: 'phone', message: '전화번호를 입력해 주세요.' })
    assert.equal(checkDriverDraft({ ...base, inviteCode: '' })?.field, 'inviteCode')
  })

  test('로그인(required)이면 배정 차량·시작일을 칸별 문구로', () => {
    assert.deepEqual(checkDriverDraft(base, { required: true }), { field: 'vehicleNumber', message: '배정 차량을 입력해 주세요.' })
    assert.deepEqual(checkDriverDraft({ ...base, vehicleNumber: '77가7777' }, { required: true }), { field: 'startDate', message: '계약 시작일을 선택해 주세요.' })
    assert.equal(checkDriverDraft(base), null)
  })

  test('메인 차량 배정·종료일이 시작일보다 앞이면 그 칸', () => {
    const cars = [{ number: '11가1111', type: 'main' }]
    assert.equal(checkDriverDraft({ ...base, vehicleNumber: '11가1111', startDate: '2026-10-01' }, { cars })?.field, 'vehicleNumber')
    assert.deepEqual(
      checkDriverDraft({ ...base, vehicleNumber: '77가7777', startDate: '2026-10-10', endDate: '2026-10-01' }),
      { field: 'endDate', message: '계약 종료일은 시작일 이후로 선택해 주세요.' },
    )
  })
})
