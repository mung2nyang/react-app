import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { upsertCallDetail } from './call-details.js'
import { dayFareTotal, dayHasUnpaid, dayWorkBadgeLabel, formatFareShort } from './calendarBadges.js'
import { addPartialPayment } from './payments.js'
import { saveDayRecord } from './day-record.js'

const dateKey = '2026-05-10'
const clients = [{ id: 'c1', companyName: '한진' }]

// Step 5(달력 홈 재작성): 달력 셀 fare 모드 뱃지용 짧은 금액 표기 — 바닐라 script.js의
// formatFareShort와 동일한 규칙(만원 이상은 "N만", 미만은 "N원")을 검증한다.
describe('formatFareShort — 달력 셀 fare 뱃지 표기', () => {
  test('10000 이상은 만 단위로 반올림해서 "N만"', () => {
    assert.equal(formatFareShort(150000), '15만')
    assert.equal(formatFareShort(10000), '1만')
    assert.equal(formatFareShort(154999), '15만')
    assert.equal(formatFareShort(155000), '16만') // Math.round 경계
  })

  test('10000 미만은 "N원"(천 단위 콤마)', () => {
    assert.equal(formatFareShort(3000), '3,000원')
    assert.equal(formatFareShort(9999), '9,999원')
    assert.equal(formatFareShort(0), '0원')
  })

  test('음수/NaN/undefined는 0원으로 떨어진다(달력 뱃지가 음수를 보여주지 않는다)', () => {
    assert.equal(formatFareShort(-500), '0원')
    assert.equal(formatFareShort(NaN), '0원')
    assert.equal(formatFareShort(undefined), '0원')
  })
})

// 달력 셀 뱃지(workBadge/isOff/hasUnpaid)를 domain에서 계산한다. CalendarGrid.jsx는
// 이 세 함수의 결과만 그대로 그린다(순수 표시).
describe('dayFareTotal / dayWorkBadgeLabel — 달력 셀 뱃지', () => {
  test('휴무일은 항상 null(뱃지 숨김) — 기록에 남은 횟수/운임과 무관하다', () => {
    assert.equal(dayWorkBadgeLabel({ isOff: true, fixedCount: 3 }, { inputMode: 'count', unitPrice: 10000 }), null)
  })

  test('기록이 없거나 횟수/운임이 전부 0이면 null', () => {
    assert.equal(dayWorkBadgeLabel(undefined, { inputMode: 'count', unitPrice: 10000 }), null)
    assert.equal(dayWorkBadgeLabel({ fixedCount: 0 }, { inputMode: 'count', unitPrice: 10000 }), null)
  })

  test('count 모드는 "N회" — 고정 횟수 + 콜상세 건수를 합친다', () => {
    const added = upsertCallDetail([], { fare: '50,000', client: '한진' }, -1, dateKey, clients)
    const data = saveDayRecord({}, dateKey, { fixedCount: 2, callDetails: added.items })
    assert.equal(dayWorkBadgeLabel(data[dateKey], { inputMode: 'count', unitPrice: 0 }), '3회')
  })

  test('fare 모드는 dayFareTotal(고정 횟수×단가 + 콜상세 운임 합)을 짧은 금액으로 표시한다', () => {
    const record = { fixedCount: 2 }
    assert.equal(dayFareTotal(record, 100000), 200000)
    assert.equal(dayWorkBadgeLabel(record, { inputMode: 'fare', unitPrice: 100000 }), '20만')
  })

  test('fare 모드에서 만원 미만 금액은 "N원"으로 표시한다', () => {
    const record = { fixedCount: 1 }
    assert.equal(dayWorkBadgeLabel(record, { inputMode: 'fare', unitPrice: 3000 }), '3,000원')
  })
})

describe('dayHasUnpaid — 달력 셀 미수 점', () => {
  function unpaidData() {
    const added = upsertCallDetail([], { fare: '80,000', client: '한진', vatExempt: false }, -1, dateKey, clients)
    return saveDayRecord({}, dateKey, { callDetails: added.items })
  }

  test('paymentOn이 꺼져 있으면 미수 콜상세가 있어도 항상 false', () => {
    assert.equal(dayHasUnpaid(unpaidData()[dateKey], false), false)
  })

  test('paymentOn이 켜져 있고 미수(완납 아님) 콜상세가 있으면 true', () => {
    assert.equal(dayHasUnpaid(unpaidData()[dateKey], true), true)
  })

  test('완납된 콜상세만 있으면 false', () => {
    const data = unpaidData()
    const { data: paidData, error } = addPartialPayment(data, dateKey, 0, '80,000')
    assert.equal(error, undefined)
    assert.equal(dayHasUnpaid(paidData[dateKey], true), false)
  })

  test('콜상세가 없으면 false', () => {
    assert.equal(dayHasUnpaid({}, true), false)
    assert.equal(dayHasUnpaid(undefined, true), false)
  })
})
