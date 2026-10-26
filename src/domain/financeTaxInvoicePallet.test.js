import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getTaxInvoiceSourceGroups } from './finance.ts'
import { monthSettlementSummary } from './monthSettlement.ts'

// 세금계산서에도 파렛트 금액 — 달력·매출과 같은 조건(로드맵 113-A).
const HANJIN = { id: 'c1', companyName: '한진', fixedRouteLinked: true, fixedUnitPrice: '250,000', palletOn: true, palletPrice: '5,000' }

function mainGroups(settings, day) {
  return getTaxInvoiceSourceGroups('2026-10', 'sales', { cars: [], clients: [HANJIN], fixedOn: true, ...settings }, { main: { '2026-10-05': day } })
    .map((group) => [group.clientName, group.supplyAmount, group.taxAmount, group.count])
}

test('고정 1회 + 파렛트 2장 → 공급가액 260,000, 부가세 26,000, 건수 1', () => {
  assert.deepEqual(mainGroups({}, { fixedCount: 1, palletCount: 2 }), [['한진', 260000, 26000, 1]])
})

test('달력 운송료 + 파렛트와 같은 금액', () => {
  const settings = { cars: [], clients: [HANJIN], fixedOn: true }
  const work = { '2026-10-05': { fixedCount: 1, palletCount: 2 } }
  const calendar = monthSettlementSummary(work, 2026, 9, { unitPrice: 250000, fixedRouteClient: HANJIN, activeFixedOn: true, clients: [HANJIN] })
  const [group] = getTaxInvoiceSourceGroups('2026-10', 'sales', settings, { main: work })
  assert.equal(group.supplyAmount, calendar.fare + calendar.palletFare)
  assert.equal(group.taxAmount, calendar.vat)
})

test('거래처 파렛트 꺼짐이면 파렛트 없음', () => {
  const clients = [{ ...HANJIN, palletOn: false }]
  assert.deepEqual(mainGroups({ clients }, { fixedCount: 1, palletCount: 2 }), [['한진', 250000, 25000, 1]])
})

test('그 차량 고정 노선 꺼짐이면 파렛트 없음', () => {
  assert.deepEqual(mainGroups({ fixedOn: false }, { fixedCount: 1, palletCount: 2 }), [['한진', 250000, 25000, 1]])
})

test('고정 0회에 파렛트만 있는 날도 그 거래처 계산서에(건수 0)', () => {
  assert.deepEqual(mainGroups({}, { fixedCount: 0, palletCount: 3 }), [['한진', 15000, 1500, 0]])
})

test('부가세는 고정·파렛트를 날마다 따로 버림', () => {
  const clients = [{ ...HANJIN, fixedUnitPrice: '10,005', palletPrice: '1,005' }]
  // 고정 10,005 → 1,000(버림), 파렛트 1,005 → 100(버림)
  assert.deepEqual(mainGroups({ clients }, { fixedCount: 1, palletCount: 1 }), [['한진', 11010, 1100, 1]])
})

test('기사 차량은 subFixedOn과 그 차량 스코프 거래처의 파렛트 단가', () => {
  const scoped = { ...HANJIN, id: 'c2', companyName: '대한', scopedToVehicleNumber: '서울12가3456', palletPrice: '7,000' }
  const settings = { cars: [{ type: 'sub', number: '서울12가3456' }], clients: [HANJIN, scoped], fixedOn: false, subFixedOn: true }
  const work = { '서울12가3456': { '2026-10-05': { fixedCount: 1, palletCount: 2 } } }
  const groups = getTaxInvoiceSourceGroups('2026-10', 'sales', settings, work, '서울12가3456')
  assert.deepEqual(groups.map((group) => [group.clientName, group.supplyAmount, group.taxAmount]), [['대한', 264000, 26400]])
  const off = getTaxInvoiceSourceGroups('2026-10', 'sales', { ...settings, subFixedOn: false }, work, '서울12가3456')
  assert.deepEqual(off.map((group) => [group.clientName, group.supplyAmount]), [['대한', 250000]])
})
