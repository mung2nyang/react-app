import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getLinkedDriverClientInvoiceGroups, getLinkedDriverSettlementDetail } from './finance.ts'

// 기사 관리 거래처 세금계산서 카드에도 고정 노선·파렛트 — 서류 발급 세금계산서와 같게(로드맵 113-C).
const PLATE = '서울99가9998'
const CAR = { type: 'sub', number: PLATE }
const LINK = { id: 'l1', vehicleNumber: PLATE, assignmentStart: '2026-10-01', assignmentEnd: '2026-10-31' }
const FIXED = { id: 'c1', companyName: '66번시험거래처', fixedRouteLinked: true, fixedUnitPrice: '30,000', palletOn: true, palletPrice: '5,000', scopedToVehicleNumber: PLATE }

/** @param {Record<string, object>} days @param {object} [extra] */
function cards(days, extra = {}) {
  const settings = { subFixedOn: true, clients: [FIXED], cars: [CAR], ...extra }
  const detail = getLinkedDriverSettlementDetail(days, '2026-10', LINK, CAR, settings)
  return getLinkedDriverClientInvoiceGroups(detail.trips, CAR, settings)
}

const summary = (result) => result.groups.map((g) => [g.clientName, g.count, g.supplyAmount, g.taxAmount, g.totalAmount])

test('고정 노선만 있는 달 — 그 차량 고정 노선 거래처 카드(2건 60,000 / 6,000)', () => {
  const result = cards({ '2026-10-05': { fixedCount: 1 }, '2026-10-06': { fixedCount: 1 } })
  assert.deepEqual(summary(result), [['66번시험거래처', 2, 60000, 6000, 66000]])
  assert.equal(result.unassignedCount, 0)
})

test('같은 거래처 콜과 한 카드로 합친다', () => {
  const result = cards({ '2026-10-05': { fixedCount: 1, callDetails: [{ client: '66번시험거래처', fare: '100,000' }] } })
  assert.deepEqual(summary(result), [['66번시험거래처', 2, 130000, 13000, 143000]])
})

test('파렛트는 금액에 넣고 건수에는 안 센다, 파렛트만 있는 날도 들어감', () => {
  const result = cards({ '2026-10-05': { fixedCount: 1, palletCount: 2 }, '2026-10-06': { fixedCount: 0, palletCount: 1 } })
  assert.deepEqual(summary(result), [['66번시험거래처', 1, 45000, 4500, 49500]])
})

test('부가세는 고정·파렛트를 따로 버림(3,333 + 555 = 3,888)', () => {
  const clients = [{ ...FIXED, fixedUnitPrice: '33,335', palletPrice: '5,555' }]
  const result = cards({ '2026-10-05': { fixedCount: 1, palletCount: 1 } }, { clients })
  assert.deepEqual(summary(result), [['66번시험거래처', 1, 38890, 3888, 42778]])
})

test('고정 노선 거래처가 없으면 카드에도 미지정에도 안 들어간다', () => {
  const result = cards({ '2026-10-05': { fixedCount: 1 } }, { clients: [{ ...FIXED, fixedRouteLinked: false }] })
  assert.deepEqual(result.groups, [])
  assert.equal(result.unassignedCount, 0)
})

test('계약 기간 밖 날은 빠진다', () => {
  const link = { ...LINK, assignmentStart: '2026-10-10' }
  const settings = { subFixedOn: true, clients: [FIXED], cars: [CAR] }
  const detail = getLinkedDriverSettlementDetail({ '2026-10-05': { fixedCount: 1 }, '2026-10-12': { fixedCount: 1 } }, '2026-10', link, CAR, settings)
  assert.deepEqual(summary(getLinkedDriverClientInvoiceGroups(detail.trips, CAR, settings)), [['66번시험거래처', 1, 30000, 3000, 33000]])
})
