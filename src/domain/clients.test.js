import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { reorderClients, resolveFixedUnitPrice, sortClientsPinnedFirst, upsertClient } from './clients.js'
import { monthWorkFareSummary } from './day-record.js'
import { getMonthlyFareRevenue } from './finance.js'

describe('거래처 저장 — 세금계산서 필드', () => {
  test('대표자·이메일·주소·업태·종목을 저장한다', () => {
    const result = upsertClient([], {
      companyName: '한진',
      managerName: '박담당',
      taxRepresentative: '이대표',
      taxEmail: 'tax@example.com',
      taxAddress: '서울시 강서구',
      taxBizType: '운수업',
      taxBizItem: '화물운송',
    })
    assert.equal(result.error, undefined)
    assert.equal(result.clients[0].taxRepresentative, '이대표')
    assert.equal(result.clients[0].taxEmail, 'tax@example.com')
    assert.equal(result.clients[0].taxAddress, '서울시 강서구')
    assert.equal(result.clients[0].taxBizType, '운수업')
    assert.equal(result.clients[0].taxBizItem, '화물운송')
  })

  test('즐겨찾기는 목록 앞으로 오고, 드래그는 같은 핀 그룹 안에서만 된다', () => {
    const first = upsertClient([], { companyName: '가', isPinned: false }).clients
    const two = upsertClient(first, { companyName: '나', isPinned: true }).clients
    assert.equal(two[0].companyName, '나')
    assert.equal(two[1].companyName, '가')
    const sorted = sortClientsPinnedFirst([
      { id: 'a', companyName: '가', isPinned: false },
      { id: 'b', companyName: '나', isPinned: true },
    ])
    assert.deepEqual(sorted.map((item) => item.id), ['b', 'a'])
    const same = reorderClients(two, two[0].id, two[1].id)
    assert.equal(same[0].companyName, '나')
  })
})

// 재감사 2차(FAIL 지적) — 달력(day-record.js/calendarBadges.js)과 매출·계산서
// (finance.js)가 "고정노선 1회 단가"를 서로 다른 소스로 계산해서, 같은 달인데도
// 달력 뱃지/월합계와 매출 화면 합계가 다른 값을 보여줄 수 있었다. resolveFixedUnitPrice
// 하나로 통일했는지 확인한다.
describe('resolveFixedUnitPrice — 달력·매출이 같은 단가를 쓰는지', () => {
  test('고정노선 연결 거래처가 있으면 그 fixedUnitPrice를 쓴다', () => {
    const settings = { clients: [{ companyName: '한진', fixedRouteLinked: true, fixedUnitPrice: '250,000' }], unitPrice: 100000 }
    assert.equal(resolveFixedUnitPrice(settings), 250000, '연결된 거래처 단가가 우선이어야 한다')
  })

  test('연결된 거래처가 없으면(Step 7 전 대부분의 상태) settings.unitPrice로 fallback한다', () => {
    const settings = { clients: [], unitPrice: 100000 }
    assert.equal(resolveFixedUnitPrice(settings), 100000)
  })

  test('연결된 거래처가 있어도 fixedUnitPrice가 0/빈값이면 unitPrice로 fallback한다', () => {
    const settings = { clients: [{ companyName: '한진', fixedRouteLinked: true, fixedUnitPrice: '' }], unitPrice: 100000 }
    assert.equal(resolveFixedUnitPrice(settings), 100000)
  })

  test('둘 다 없으면 0', () => {
    assert.equal(resolveFixedUnitPrice({}), 0)
  })

  // 통합 확인: CalendarPage.jsx(달력)와 finance.js(매출)가 정확히 이 함수를 거쳐서
  // fixedCount 단가를 계산하므로, 같은 settings/workData를 넣으면 "고정노선분" 금액이
  // 반드시 같아야 한다 — 되돌려서 확인: resolveFixedUnitPrice 없이 finance.js가 예전처럼
  // getFixedRouteClient(settings)?.fixedUnitPrice만 보게(연결된 거래처 없으면 0) 하고
  // 달력 쪽만 settings.unitPrice를 쓰면, 아래 두 값이 달라진다(120000 vs 0) — 지금은
  // 같은 resolveFixedUnitPrice를 거치므로 항상 같다.
  test('연결된 거래처가 없는 상태에서 달력 월합계와 매출 월합계의 고정노선분이 일치한다', () => {
    const settings = { clients: [], unitPrice: 120000, fixedOn: true, cars: [] }
    const data = { '2026-08-05': { isOff: false, fixedCount: 3, callDetails: [], fixedRouteCounts: {} } }
    const calendarFixedFare = monthWorkFareSummary(data, 2026, 7, resolveFixedUnitPrice(settings)).fixedFare
    const revenueFixedFare = getMonthlyFareRevenue('2026-08', settings, { main: data }).totalFare
    assert.equal(calendarFixedFare, 3 * 120000, '달력 월합계는 unitPrice fallback으로 360,000원이어야 한다')
    assert.equal(revenueFixedFare, calendarFixedFare, '매출 화면 합계도 달력과 같은 값이어야 한다(단일 계약)')
  })
})
