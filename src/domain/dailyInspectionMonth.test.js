// @ts-check
// 서류 발급 일상점검표 한 달 표(9-C-1): 8일 구간, 처음 구간, 칸 표기(오늘 이후 빈칸·휴무 미·없음 미·양호 O·불량 X).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { initialRangeIndex, inspectionMark, rangeDays } from './dailyInspectionMonth.js'

test('구간: 1~8·9~16·17~24·25~끝날(2월 28일, 10월 31일)', () => {
  assert.deepEqual(rangeDays(2026, 9, 0), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.deepEqual(rangeDays(2026, 9, 3), [25, 26, 27, 28, 29, 30, 31])
  assert.deepEqual(rangeDays(2026, 1, 3), [25, 26, 27, 28])
})

test('처음 구간: 이번 달이면 오늘이 든 구간, 다른 달이면 첫 구간', () => {
  assert.equal(initialRangeIndex(2026, 9, new Date(2026, 9, 1)), 0)
  assert.equal(initialRangeIndex(2026, 9, new Date(2026, 9, 9)), 1)
  assert.equal(initialRangeIndex(2026, 9, new Date(2026, 9, 31)), 3)
  assert.equal(initialRangeIndex(2026, 8, new Date(2026, 9, 20)), 0)
})

test('칸: 오늘 이후 빈칸, 휴무는 저장분 있어도 미, 없음 미, 양호 O, 불량 X', () => {
  const base = { todayKey: '2026-10-01', itemKey: 'tires' }
  assert.equal(inspectionMark({ ...base, dateKey: '2026-10-02', isOff: false, items: { tires: 'good' } }), '')
  assert.equal(inspectionMark({ ...base, dateKey: '2026-09-30', isOff: true, items: { tires: 'good' } }), '미')
  assert.equal(inspectionMark({ ...base, dateKey: '2026-09-30', isOff: false, items: null }), '미')
  assert.equal(inspectionMark({ ...base, dateKey: '2026-10-01', isOff: false, items: { tires: 'good' } }), 'O')
  assert.equal(inspectionMark({ ...base, dateKey: '2026-09-29', isOff: false, items: { tires: 'bad' } }), 'X')
})
