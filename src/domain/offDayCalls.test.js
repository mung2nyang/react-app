// @ts-check
// 로드맵 75 — 휴무일 콜은 모든 화면에서 제외(보리 결정 2026-10-15, F-03 변경).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { monthCallUnpaidTotal } from './day-record.ts'
import { dayHasUnpaid } from './calendarBadges.ts'
import { getMonthlyDriverTotals } from './financeCore.ts'

/** @type {import('./dayRecordTypes.ts').DayRecordLike} */
const OFF_DAY = { isOff: true, callDetails: [{ id: 'c-off', fare: '10,000', client: '거래처' }] }
/** @type {import('./dayRecordTypes.ts').DayRecordLike} */
const WORK_DAY = { callDetails: [{ id: 'c-work', fare: '20,000', client: '거래처' }] }

test('75-1: 달력 이번 달 미수 합계에서 휴무일 콜은 빠지고, 휴무 아닌 날은 그대로', () => {
  assert.equal(monthCallUnpaidTotal({ '2026-09-10': OFF_DAY, '2026-09-11': WORK_DAY }, 2026, 8), 20000)
})

test('75-2: 휴무일 칸에는 미수 빨간 점이 없고, 휴무 아닌 날은 그대로', () => {
  assert.equal(dayHasUnpaid(OFF_DAY, true), false)
  assert.equal(dayHasUnpaid(WORK_DAY, true), true)
})

test('75-3: 기사 정산 합계에서 휴무일 콜은 빠지고, 휴무 아닌 날은 그대로', () => {
  const totals = getMonthlyDriverTotals({ '2026-09-10': OFF_DAY, '2026-09-11': WORK_DAY }, '2026-09')
  assert.equal(totals.grossAmount, 20000)
  assert.equal(totals.count, 1)
})
