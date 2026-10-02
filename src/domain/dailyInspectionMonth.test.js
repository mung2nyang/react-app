// @ts-check
// 서류 발급 일상점검표 한 달 표(9-C-1): 8일 구간, 처음 구간, 칸 표기(오늘 이후 빈칸·휴무 미·없음 미·양호 O·불량 X).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { actionNoteLines, initialRangeIndex, inspectionFileBaseName, inspectorCell, inspectionMark, legalFormMark, monthDays, rangeDays } from './dailyInspectionMonth.js'

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

test('9-D 서식 날짜: 1~그 달 끝날(21일 포함, 2월 28·29일, 30·31일 달)', () => {
  assert.equal(monthDays(2026, 9).length, 31)
  assert.ok(monthDays(2026, 9).includes(21))
  assert.equal(monthDays(2026, 8).length, 30)
  assert.equal(monthDays(2026, 1).length, 28)
  assert.equal(monthDays(2028, 1).length, 29)
})

test('9-D 서식 표기 ○/×/미/빈칸, 점검자 칸은 앞날·휴무·없음이면 빈칸', () => {
  assert.deepEqual(['O', 'X', '미', ''].map((mark) => legalFormMark(/** @type {'O'|'X'|'미'|''} */ (mark))), ['○', '×', '미', ''])
  const record = { items: {}, actionNote: '', inspectorName: ' 김기사 ' }
  assert.equal(inspectorCell({ dateKey: '2026-10-02', todayKey: '2026-10-02', isOff: false, record }), '김기사')
  assert.equal(inspectorCell({ dateKey: '2026-10-03', todayKey: '2026-10-02', isOff: false, record }), '')
  assert.equal(inspectorCell({ dateKey: '2026-10-01', todayKey: '2026-10-02', isOff: true, record }), '')
  assert.equal(inspectorCell({ dateKey: '2026-10-01', todayKey: '2026-10-02', isOff: false, record: undefined }), '')
})

test('9-D 조치 기록 줄: "N일 내용" 날짜 순, 빈 것 뺌 / 파일 이름', () => {
  const byDate = {
    '2026-10-12': { items: {}, actionNote: '타이어 교체', inspectorName: '' },
    '2026-10-03': { items: {}, actionNote: '창닦이기 불량', inspectorName: '' },
    '2026-10-05': { items: {}, actionNote: '  ', inspectorName: '' },
  }
  assert.deepEqual(actionNoteLines(byDate), ['3일 창닦이기 불량', '12일 타이어 교체'])
  assert.equal(inspectionFileBaseName(2026, 9, '11가1111'), '일상점검표_2026년10월_11가1111')
  assert.equal(inspectionFileBaseName(2026, 0, ''), '일상점검표_2026년1월')
})
