import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { dueDateForClient } from './clients.js'
import { getMonthlyFareRevenue } from './finance.js'
import {
  callFareTotal,
  countCallTrips,
  monthCallUnpaidTotal,
  monthWorkFareSummary,
  saveDayRecord,
} from './day-record.js'
import { upsertCallDetail } from './call-details.js'
import { addPartialPayment, toggleCallPaymentStatus } from './payments.js'

const dateKey = '2026-05-10'
const clients = [
  {
    id: 'c1',
    companyName: '한진',
    commEnabled: true,
    commType: 'percent',
    commValue: '10',
    paymentTerm: 'next_month_end',
  },
]

describe('콜상세 저장', () => {
  test('운임·상차지·하차지가 모두 비면 저장하지 않는다', () => {
    const result = upsertCallDetail([], { client: '한진' }, -1, dateKey, clients)
    assert.equal(result.error, '운임 또는 상·하차지 중 하나를 입력해 주세요.')
  })

  test('운임만 있어도 저장되고 수수료 스냅샷을 남긴다', () => {
    const result = upsertCallDetail([], { fare: '100,000', client: '한진', vatExempt: false }, -1, dateKey, clients)
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].fare, '100,000')
    assert.equal(result.items[0].workDate, dateKey)
    assert.deepEqual(result.items[0].commissionSnapshot, { enabled: true, type: 'percent', value: '10' })
    assert.deepEqual(result.items[0].payments, [])
  })

  test('횟수가 0이어도 콜상세가 있으면 날짜를 지우지 않는다', () => {
    const added = upsertCallDetail([], { fare: '80,000', loadLoc: '서울' }, -1, dateKey, [])
    const data = saveDayRecord({}, dateKey, { fixedCount: 0, callDetails: added.items })
    assert.equal(data[dateKey].callDetails.length, 1)
    assert.equal(callFareTotal(data[dateKey]), 80000)
  })

  test('수정 시 기존 입금 이력을 유지한다', () => {
    const first = upsertCallDetail([], { fare: '50,000', unloadLoc: '부산' }, -1, dateKey, [])
    first.items[0].payments = [{ amount: 10000 }]
    first.items[0].paymentStatus = '미수'
    const edited = upsertCallDetail(first.items, { fare: '60,000', unloadLoc: '부산' }, 0, dateKey, [])
    assert.equal(edited.items[0].fare, '60,000')
    assert.equal(edited.items[0].payments[0].amount, 10000)
  })

  test('선택 입력 필드와 계기판 거리를 저장한다', () => {
    const result = upsertCallDetail([], {
      fare: '80,000',
      loadLoc: '서울',
      departureTime: '09:00',
      arrivalTime: '11:30',
      platform: '화물맨',
      cargoTonnage: '5',
      receipt: '전자',
      startOdometer: '10,000',
      endOdometer: '10,120',
    }, -1, dateKey, [])
    const item = result.items[0]
    assert.equal(item.departureTime, '09:00')
    assert.equal(item.arrivalTime, '11:30')
    assert.equal(item.platform, '화물맨')
    assert.equal(item.cargoTonnage, '5')
    assert.equal(item.receipt, '전자')
    assert.equal(item.distanceKm, '120')
  })
})

describe('수금 처리', () => {
  test('토글은 남은 금액을 한 번에 넣고, 다시 누르면 입금 전체를 비운다', () => {
    const added = upsertCallDetail([], { fare: '100,000', client: '한진' }, -1, dateKey, clients)
    added.items[0].payments = [{ id: 'p1', amount: 30000 }]
    let data = saveDayRecord({}, dateKey, { callDetails: added.items })
    data = toggleCallPaymentStatus(data, dateKey, 0).data
    assert.equal(data[dateKey].callDetails[0].payments.length, 2)
    assert.equal(data[dateKey].callDetails[0].paymentStatus, '수금 완료')
    data = toggleCallPaymentStatus(data, dateKey, 0).data
    assert.deepEqual(data[dateKey].callDetails[0].payments, [])
    assert.equal(data[dateKey].callDetails[0].paymentStatus, '미수')
  })

  test('부분 입금은 월 미수금 합계에 반영된다', () => {
    const added = upsertCallDetail([], { fare: '100,000', client: '한진' }, -1, dateKey, clients)
    let data = saveDayRecord({}, dateKey, { callDetails: added.items })
    assert.equal(monthCallUnpaidTotal(data, 2026, 4), 100000)
    data = addPartialPayment(data, dateKey, 0, '40,000').data
    assert.equal(monthCallUnpaidTotal(data, 2026, 4), 60000)
  })
})

describe('횟수×단가 + 콜상세 운임', () => {
  test('월 합계는 횟수 운임에 콜 운임을 더하고 면제는 부가세 0이다', () => {
    let data = saveDayRecord({}, dateKey, { fixedCount: 2 })
    const taxed = upsertCallDetail([], { fare: '100,000', client: '한진' }, -1, dateKey, clients)
    const exempt = upsertCallDetail(taxed.items, { fare: '50,000', vatExempt: true, client: '한진' }, -1, dateKey, clients)
    data = saveDayRecord(data, dateKey, { fixedCount: 2, callDetails: exempt.items })

    const summary = monthWorkFareSummary(data, 2026, 4, 250000)
    assert.equal(summary.trips, 2)
    assert.equal(summary.callTrips, 2)
    assert.equal(summary.fixedFare, 500000)
    assert.equal(summary.callFare, 150000)
    assert.equal(summary.fare, 650000)
    assert.equal(summary.vat, 50000 + 10000)
    assert.equal(summary.total, 650000 + 60000)
  })

  test('공차는 운행 횟수에 넣지 않고 운임은 더한다', () => {
    const added = upsertCallDetail([], { fare: '30,000', client: '한진' }, -1, dateKey, clients)
    added.items[0].distanceType = '공차'
    const record = { isOff: false, fixedCount: 0, callDetails: added.items }
    assert.equal(countCallTrips(record), 0)
    assert.equal(callFareTotal(record), 30000)
  })

  test('휴무면 콜 운임이 월 합계에 안 잡힌다', () => {
    const added = upsertCallDetail([], { fare: '90,000', client: '한진' }, -1, dateKey, clients)
    const data = saveDayRecord({}, dateKey, { isOff: true, fixedCount: 0, callDetails: added.items })
    const summary = monthWorkFareSummary(data, 2026, 4, 250000)
    assert.equal(summary.callFare, 0)
    assert.equal(summary.fixedFare, 0)
  })

  test('원본 getMonthlyFareRevenue와 같은 값이 나온다', () => {
    const added = upsertCallDetail([], { fare: '100,000', client: '한진', vatExempt: false }, -1, dateKey, clients)
    const data = saveDayRecord({}, dateKey, { fixedCount: 2, callDetails: added.items })
    const summary = monthWorkFareSummary(data, 2026, 4, 250000)
    const originalShape = getMonthlyFareRevenue('2026-05', {
      fixedOn: true,
      cars: [],
      clients: [{ companyName: '한진', fixedRouteLinked: true, fixedUnitPrice: '250,000', palletOn: false }],
    }, { main: data })
    assert.equal(summary.fare, originalShape.totalFare)
    assert.equal(summary.trips + summary.callTrips, originalShape.tripCount)
  })
})

describe('입금 예정일', () => {
  test('익월 말일 정산은 원본과 같다', () => {
    assert.equal(dueDateForClient('2026-01-31', { paymentTerm: 'next_month_end' }), '2026-02-28')
  })
})

// Step 5(달력 홈 재작성) 재감사 3번: dayFareTotal/dayWorkBadgeLabel/dayHasUnpaid는
// calendarBadges.js(타입 전용 모듈)로 옮겼다 — 그 테스트도 calendarBadges.test.js로
// 함께 옮겼다.
