import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { computeFixedRouteFare, getFixedRouteClient, reorderClients, resolveFixedUnitPrice, sortClientsPinnedFirst, upsertClient } from './clients.js'
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

  test('고정노선은 계정에서 한 곳만 남기고 나머지는 같은 결과에서 해제한다', () => {
    const first = upsertClient([], { companyName: 'A', fixedRouteLinked: true, fixedUnitPrice: '100000' }).clients
    const two = upsertClient(first, { companyName: 'B', fixedRouteLinked: true, fixedUnitPrice: '200000' }).clients
    assert.equal(two.filter((item) => item.fixedRouteLinked).length, 1)
    assert.equal(two.find((item) => item.companyName === 'B')?.fixedRouteLinked, true)
    assert.equal(two.find((item) => item.companyName === 'A')?.fixedRouteLinked, false)
  })

  test('수정해도 id와 supabaseId를 보존하고 수수료·파렛트를 저장한다', () => {
    const created = upsertClient([], { companyName: '한진', commEnabled: true, commType: 'percent', commValue: '10', palletOn: true, palletPrice: '3000' })
    const id = created.id
    created.clients[0].supabaseId = 'sb-client-1'
    const edited = upsertClient(created.clients, {
      companyName: '한진물류',
      commEnabled: true,
      commType: 'percent',
      commValue: '12',
      palletOn: true,
      palletPrice: '4000',
    }, id)
    assert.equal(edited.clients[0].id, id)
    assert.equal(edited.clients[0].supabaseId, 'sb-client-1')
    assert.equal(edited.clients[0].commValue, '12')
    assert.equal(edited.clients[0].palletPrice, '4000')
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

  test('scopedToVehicleNumber: draft에 차량번호가 있으면 반영되고 없으면 키 자체가 들어가지 않는다', () => {
    const regular = upsertClient([], { companyName: '일반거래처' }).clients[0]
    assert.equal('scopedToVehicleNumber' in regular, false, '일반 거래처는 scoped 키가 없어야 한다')

    const scoped = upsertClient([], { companyName: '기사거래처', scopedToVehicleNumber: '11가1111' }).clients[0]
    assert.equal(scoped.scopedToVehicleNumber, '11가1111')

    const edited = upsertClient([scoped], { companyName: '기사거래처수정', scopedToVehicleNumber: '11가1111' }, scoped.id).clients[0]
    assert.equal(edited.companyName, '기사거래처수정')
    assert.equal(edited.scopedToVehicleNumber, '11가1111')
  })

  test('reorderClients: scoped 거래처는 제외하고 일반 거래처끼리만 재정렬되며 scoped는 뒤에 보존된다', () => {
    const clients = [
      { id: 'c1', companyName: '거래처1', isPinned: false },
      { id: 'c2', companyName: '거래처2', isPinned: false },
      { id: 's1', companyName: '기사거래처1', scopedToVehicleNumber: '11가1111' },
      { id: 'c3', companyName: '거래처3', isPinned: false },
    ]
    const reordered = reorderClients(clients, 'c1', 'c3')
    assert.deepEqual(reordered.map((c) => c.id), ['c2', 'c3', 'c1', 's1'])
  })

  // §15 슬라이스 D(2026-09-18) — 고정노선 "1곳 제한"이 차주 본인과 연동기사
  // 각자의 스코프(scopedToVehicleNumber)별로 독립돼야 한다(sot.md §4-4c는
  // "1곳"까지만 확정, 범위는 이번에 스코프별로 정정).
  test('연동기사(스코프 다름)의 고정노선은 차주 본인 고정노선을 해제하지 않는다', () => {
    const owner = upsertClient([], { companyName: '차주거래처', fixedRouteLinked: true, fixedUnitPrice: '100000' }).clients
    const withDriver = upsertClient(owner, {
      companyName: '기사거래처', fixedRouteLinked: true, fixedUnitPrice: '200000', scopedToVehicleNumber: '11가1111',
    }).clients
    assert.equal(withDriver.find((c) => c.companyName === '차주거래처')?.fixedRouteLinked, true, '차주 것은 그대로 켜져 있어야 한다')
    assert.equal(withDriver.find((c) => c.companyName === '기사거래처')?.fixedRouteLinked, true)
  })

  test('같은 연동기사(같은 스코프) 안에서는 여전히 1곳만 남는다', () => {
    const first = upsertClient([], { companyName: 'A기사거래처', fixedRouteLinked: true, fixedUnitPrice: '100000', scopedToVehicleNumber: '11가1111' }).clients
    const two = upsertClient(first, { companyName: 'B기사거래처', fixedRouteLinked: true, fixedUnitPrice: '200000', scopedToVehicleNumber: '11가1111' }).clients
    assert.equal(two.filter((c) => c.fixedRouteLinked).length, 1)
    assert.equal(two.find((c) => c.companyName === 'B기사거래처')?.fixedRouteLinked, true)
    assert.equal(two.find((c) => c.companyName === 'A기사거래처')?.fixedRouteLinked, false)
  })
})

describe('getFixedRouteClient/resolveFixedUnitPrice — 스코프 지정 시 fallback (§15 슬라이스 D)', () => {
  test('스코프 전용 고정노선이 있으면 그걸 쓴다', () => {
    const settings = {
      clients: [
        { id: 'c-owner', companyName: '차주거래처', fixedRouteLinked: true, fixedUnitPrice: '100000' },
        { id: 'c-driver', companyName: '기사거래처', fixedRouteLinked: true, fixedUnitPrice: '200000', scopedToVehicleNumber: '11가1111' },
      ],
    }
    assert.equal(getFixedRouteClient(settings, '11가1111')?.id, 'c-driver')
    assert.equal(resolveFixedUnitPrice(settings, '11가1111'), 200000)
  })

  test('스코프 전용 고정노선이 없으면 차주 본인(미스코프) 것으로 fallback한다', () => {
    const settings = {
      clients: [{ id: 'c-owner', companyName: '차주거래처', fixedRouteLinked: true, fixedUnitPrice: '100000' }],
    }
    assert.equal(getFixedRouteClient(settings, '11가1111')?.id, 'c-owner')
    assert.equal(resolveFixedUnitPrice(settings, '11가1111'), 100000)
  })

  test('scopeKey를 안 넘기면 기존처럼 계정 전체에서 찾는다(하위호환)', () => {
    const settings = {
      clients: [{ id: 'c-driver', companyName: '기사거래처', fixedRouteLinked: true, fixedUnitPrice: '200000', scopedToVehicleNumber: '11가1111' }],
    }
    assert.equal(getFixedRouteClient(settings)?.id, undefined, '스코프 없이는 scoped 전용 고정노선을 안 찾는다(차주 fallback 대상이 없음)')
  })
})

// 재감사 2차(FAIL 지적) — 달력(day-record.js/calendarBadges.js)과 매출·계산서
// (finance.js)가 "고정노선 1회 단가"를 서로 다른 소스로 계산해서, 같은 달인데도
// 달력 뱃지/월합계와 매출 화면 합계가 다른 값을 보여줄 수 있었다. resolveFixedUnitPrice
// 하나로 통일했는지 확인한다.
describe('resolveFixedUnitPrice — 달력·매출이 같은 단가를 쓰는지', () => {
  test('고정노선 연결 거래처가 있으면 그 fixedUnitPrice를 쓴다', () => {
    const settings = { clients: [{ id: 'c-fixed', companyName: '한진', fixedRouteLinked: true, fixedUnitPrice: '250,000' }], unitPrice: 100000 }
    assert.equal(resolveFixedUnitPrice(settings), 250000, '연결된 거래처 단가가 우선이어야 한다')
  })

  test('연결된 거래처가 없으면 0이다(설정 unitPrice는 쓰지 않는다)', () => {
    const settings = { clients: [], unitPrice: 100000 }
    assert.equal(resolveFixedUnitPrice(settings), 0)
  })

  test('연결된 거래처가 있어도 fixedUnitPrice가 0/빈값이면 0이다', () => {
    const settings = { clients: [{ id: 'c-empty', companyName: '한진', fixedRouteLinked: true, fixedUnitPrice: '' }], unitPrice: 100000 }
    assert.equal(resolveFixedUnitPrice(settings), 0)
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
    assert.equal(calendarFixedFare, 0, '거래처 단가가 없으면 고정노선분은 0원이어야 한다')
    assert.equal(revenueFixedFare, calendarFixedFare, '매출 화면 합계도 달력과 같은 값이어야 한다(단일 계약)')
  })
})

// 2026-09-17: 기사 정산액이 고정노선 운행을 못 잡던 버그(financeCore.js
// getMonthlyDriverTotals)의 원인 함수. 실제 day record는 fare 필드를 안 저장하고
// fixedCount만 있다 — record.fare 같은 필드가 있는 픽스처가 아니라 실제 저장
// 모양으로 검증한다.
describe('computeFixedRouteFare — 고정노선 단가×횟수(fare 필드 없는 실제 저장 모양)', () => {
  test('fixedCount × fixedUnitPrice', () => {
    const record = { isOff: false, fixedCount: 2 }
    assert.equal(computeFixedRouteFare(record, { fixedUnitPrice: 250000 }), 500000)
  })

  test('휴무(isOff)면 0', () => {
    const record = { isOff: true, fixedCount: 2 }
    assert.equal(computeFixedRouteFare(record, { fixedUnitPrice: 250000 }), 0)
  })

  test('파렛트는 subFixedOn·activePalletOn 둘 다 켜졌을 때만 더한다', () => {
    const record = { isOff: false, fixedCount: 1, palletCount: 3 }
    const base = { fixedUnitPrice: 250000, palletUnitPrice: 10000 }
    assert.equal(computeFixedRouteFare(record, base), 250000, '토글 꺼짐 — 파렛트 미포함')
    assert.equal(
      computeFixedRouteFare(record, { ...base, subFixedOn: true, activePalletOn: true }),
      250000 + 3 * 10000,
      '토글 켜짐 — 파렛트 포함',
    )
  })

  test('fixedCount 0이면 0', () => {
    assert.equal(computeFixedRouteFare({ isOff: false, fixedCount: 0 }, { fixedUnitPrice: 250000 }), 0)
  })
})
