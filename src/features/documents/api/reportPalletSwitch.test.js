import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildMonthReport } from './reportSummary.js'

// 내역서 파렛트는 그 일지의 고정 노선 스위치로 — 달력과 같음(로드맵 113-B).
const PLATE = '서울12가3456'
const SUB_CARS = /** @type {Array<import('../../../domain/financeTypes.ts').CarLike>} */ ([{ id: 's1', type: 'sub', number: PLATE }])
const CLIENTS = [{ id: 'c1', companyName: '한진', fixedRouteLinked: true, fixedUnitPrice: '250,000', palletOn: true, palletPrice: '5,000' }]
const WORK = { '2026-10-05': { fixedCount: 1, palletCount: 2, callDetails: [] } }

/** @param {{ fixedOn: boolean, subFixedOn: boolean }} switches @param {string} [logKey] */
function pallet(switches, logKey) {
  const report = buildMonthReport('test-report-pallet-switch', 2026, 9, [], SUB_CARS, switches, WORK, CLIENTS, {}, logKey)
  const row = report.days.find((day) => day.day === 5)
  return { showPallet: report.showPallet, palletCount: row?.palletCount, total: report.total }
}

test('차주가 보는 기사 차량 내역서 — 메인 꺼짐·기사 차량 켜짐이면 파렛트 10,000원 들어감', () => {
  assert.deepEqual(pallet({ fixedOn: false, subFixedOn: true }, PLATE), { showPallet: true, palletCount: 2, total: 286000 })
})

test('차주가 보는 기사 차량 내역서 — 메인 켜짐·기사 차량 꺼짐이면 파렛트 없음', () => {
  assert.deepEqual(pallet({ fixedOn: true, subFixedOn: false }, PLATE), { showPallet: false, palletCount: 0, total: 275000 })
})

test('일지 키 main(연동 기사 본인, 차량 종류 sub)은 fixedOn을 본다', () => {
  assert.deepEqual(pallet({ fixedOn: true, subFixedOn: false }, 'main'), { showPallet: true, palletCount: 2, total: 286000 })
  assert.deepEqual(pallet({ fixedOn: false, subFixedOn: true }), { showPallet: false, palletCount: 0, total: 275000 })
})

test('두 스위치가 같으면 일지 키와 상관없이 같다', () => {
  assert.deepEqual(pallet({ fixedOn: true, subFixedOn: true }, PLATE), pallet({ fixedOn: true, subFixedOn: true }, 'main'))
  assert.deepEqual(pallet({ fixedOn: false, subFixedOn: false }, PLATE), pallet({ fixedOn: false, subFixedOn: false }, 'main'))
})
