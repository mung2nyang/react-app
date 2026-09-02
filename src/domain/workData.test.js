import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { dueDateForClient } from './clients.js'
import { getMonthlyFareRevenue } from './finance.js'
import {
  backfillCallDetailIds,
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
    const detailId = added.items[0].id
    added.items[0].payments = [{ id: 'p1', amount: 30000 }]
    let data = saveDayRecord({}, dateKey, { callDetails: added.items })
    data = toggleCallPaymentStatus(data, dateKey, detailId).data
    assert.equal(data[dateKey].callDetails[0].payments.length, 2)
    assert.equal(data[dateKey].callDetails[0].paymentStatus, '수금 완료')
    data = toggleCallPaymentStatus(data, dateKey, detailId).data
    assert.deepEqual(data[dateKey].callDetails[0].payments, [])
    assert.equal(data[dateKey].callDetails[0].paymentStatus, '미수')
  })

  test('부분 입금은 월 미수금 합계에 반영된다', () => {
    const added = upsertCallDetail([], { fare: '100,000', client: '한진' }, -1, dateKey, clients)
    const detailId = added.items[0].id
    let data = saveDayRecord({}, dateKey, { callDetails: added.items })
    assert.equal(monthCallUnpaidTotal(data, 2026, 4), 100000)
    data = addPartialPayment(data, dateKey, detailId, '40,000').data
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

// Step 6 재감사(FAIL 지적 3번) — backfillCallDetailIds: id 없는 레거시 콜상세를
// "로드 시 정확히 한 번" 영구 id로 채운다. 예전 getCallDetails의 `legacy-${index}`는
// 배열 인덱스 기반이라 삭제·재정렬·재로드마다 값이 흔들렸다 — 아래 테스트들이
// 그 세 시나리오 모두에서 안정적인지 확인한다.
describe('backfillCallDetailIds — 레거시 콜상세 id를 로드 시 한 번만 채운다', () => {
  test('id 없는 항목만 채우고, id 있는 항목은 그대로 둔다', () => {
    const record = { callDetails: [{ id: 'kept', fare: '1' }, { fare: '2' }] }
    const { record: next, changed } = backfillCallDetailIds(record)
    assert.equal(changed, true)
    assert.equal(next.callDetails[0].id, 'kept')
    assert.equal(typeof next.callDetails[1].id, 'string')
    assert.ok(next.callDetails[1].id.length > 0)
  })

  test('숫자 id는 문자열로만 고치고 새 trp_ id를 만들지 않는다', () => {
    const record = { callDetails: [{ id: 42, fare: '1' }] }
    const { record: next, changed } = backfillCallDetailIds(record)
    assert.equal(changed, true)
    assert.equal(next.callDetails[0].id, '42')
  })

  test('모든 항목에 이미 id가 있으면 changed:false이고 같은 참조를 그대로 돌려준다(멱등)', () => {
    const record = { callDetails: [{ id: 'a', fare: '1' }] }
    const result = backfillCallDetailIds(record)
    assert.equal(result.changed, false)
    assert.equal(result.record, record, '바뀔 게 없으면 새 객체를 만들지 않아야 한다')
  })

  test('콜상세가 없거나 record가 없으면 changed:false', () => {
    assert.equal(backfillCallDetailIds(undefined).changed, false)
    assert.equal(backfillCallDetailIds({ callDetails: [] }).changed, false)
  })

  test('한 번 채운 뒤 다시 호출해도(재로드 시뮬레이션) 같은 id가 유지된다', () => {
    const first = backfillCallDetailIds({ callDetails: [{ fare: '1' }, { fare: '2' }] })
    const idsFirst = first.record.callDetails.map((item) => item.id)
    // "재로드"를 흉내낸다 — 첫 결과를 그대로 store에서 다시 읽었다고 가정.
    const second = backfillCallDetailIds(first.record)
    assert.equal(second.changed, false)
    assert.deepEqual(second.record.callDetails.map((item) => item.id), idsFirst)
  })

  test('삭제 후에도 남아있는 항목의 id는 배열 인덱스가 아니라 그 자체로 유지된다', () => {
    const migrated = backfillCallDetailIds({ callDetails: [{ fare: '1' }, { fare: '2' }, { fare: '3' }] })
    const [first, second, third] = migrated.record.callDetails
    // 맨 앞 항목을 삭제(인덱스가 하나씩 당겨짐)해도, 남은 항목의 id 자체는 안 바뀐다.
    const afterDelete = migrated.record.callDetails.filter((item) => item.id !== first.id)
    assert.deepEqual(afterDelete.map((item) => item.id), [second.id, third.id])
    // 예전(legacy-${index}) 방식이었다면 이 시점에서 second가 legacy-0으로, third가
    // legacy-1로 값이 바뀌어(삭제 전엔 각각 legacy-1/legacy-2였다) 재감사에서 지적된
    // 불안정성이 재현됐을 것이다 — backfillCallDetailIds는 인덱스와 무관한 값이라 안 바뀐다.
    const reread = backfillCallDetailIds({ callDetails: afterDelete })
    assert.equal(reread.changed, false, '이미 다 id가 있으니 재계산이 없어야 한다')
    assert.deepEqual(reread.record.callDetails.map((item) => item.id), [second.id, third.id])
  })

  test('재정렬 후에도 각 항목의 id는 그대로 따라간다', () => {
    const migrated = backfillCallDetailIds({ callDetails: [{ fare: '1' }, { fare: '2' }] })
    const [first, second] = migrated.record.callDetails
    const reordered = [second, first]
    const reread = backfillCallDetailIds({ callDetails: reordered })
    assert.equal(reread.changed, false)
    assert.deepEqual(reread.record.callDetails.map((item) => item.id), [second.id, first.id])
  })

  test('hydrate 왕복(클라우드에서 raw.id로 되돌아온 값)에서도 같은 id가 유지된다', () => {
    // syncWorkData.js는 transport_details.raw에 콜상세 객체를 그대로 저장하고,
    // hydrateMerge.js의 mergeWorkDataFromRows는 그 raw를 그대로 되돌려 놓는다 — 즉
    // "클라우드에 한 번 실제 id로 올라간 뒤 다시 내려온" 상황은 id가 이미 있는
    // 레코드를 다시 backfillCallDetailIds에 넣는 것과 동일하다.
    const migrated = backfillCallDetailIds({ callDetails: [{ fare: '1' }] })
    const cloudRoundTrip = JSON.parse(JSON.stringify(migrated.record)) // raw로 직렬화/역직렬화 흉내
    const afterHydrate = backfillCallDetailIds(cloudRoundTrip)
    assert.equal(afterHydrate.changed, false)
    assert.equal(afterHydrate.record.callDetails[0].id, migrated.record.callDetails[0].id)
  })
})

describe('saveDayRecord — 비용 임베드를 일지에 남기지 않는다', () => {
  test('이전 기록의 fuel/maint/misc는 저장 결과에서 빠진다', () => {
    const prev = {
      [dateKey]: {
        isOff: false,
        fixedCount: 1,
        callDetails: [],
        fuelItems: [{ type: '주유', cost: 1 }],
        maintItems: [{ name: '오일', fare: 1 }],
        miscItems: [{ name: '기타', fare: 1 }],
      },
    }
    const next = saveDayRecord(prev, dateKey, { fixedCount: 1, callDetails: [] })
    assert.equal(next[dateKey].fuelItems, undefined)
    assert.equal(next[dateKey].maintItems, undefined)
    assert.equal(next[dateKey].miscItems, undefined)
    assert.equal(next[dateKey].fixedCount, 1)
  })

  test('같은 id 콜상세는 저장 시 한 건만 남긴다', () => {
    const next = saveDayRecord({}, dateKey, {
      fixedCount: 1,
      callDetails: [
        { id: 'trp_a', fare: '1,000' },
        { id: 'trp_a', fare: '1,000' },
        { id: 7, fare: '2,000' },
        { id: '7', fare: '2,000' },
      ],
    })
    assert.equal(next[dateKey].callDetails.length, 2)
    assert.equal(next[dateKey].callDetails[0].id, 'trp_a')
    assert.equal(next[dateKey].callDetails[1].id, '7')
  })
})
