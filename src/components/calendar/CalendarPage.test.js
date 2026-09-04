// 재감사 3차(FAIL 지적 3번) — "연결 거래처가 있는 상태에서 달력 단가 편집 →
// Store/localStorage → 달력 합계 → 매출 합계가 모두 새 값으로 바뀌는 컴포넌트
// 테스트"를 추가한다. App.test.js와 같은 jsxLoaderHook 인프라를 재사용하지만, 이
// 화면 하나만 가볍게 MemoryRouter로 렌더한다(전체 App 부트가 필요 없다).
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

// app-store.js가 (scheduleCloudSync를 통해) 실제 supabaseClient.js를 불러 Node
// 테스트 프로세스가 매달리는 문제를 막는다 — app-store.test.js와 같은 이유.
import '../../testSupport/stubSupabaseClient.js'
import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { MemoryRouter } = await import('react-router-dom')
const { act } = React
const { default: CalendarPage } = await import('./CalendarPage.jsx')
const { commitClients, commitSettings, commitWorkData } = await import('../../store/commitHelpers.js')
const { getState } = await import('../../store/app-store.js')
const { normalizeSettings } = await import('../../domain/practiceSettings.js')
const { getMonthlyFareRevenue, getOwnerMonthlyFinanceDetail } = await import('../../domain/finance.js')
const { buildFinanceSettings } = await import('../../lib/ownerFinance.js')
const { monthWorkFareSummary } = await import('../../domain/day-record.js')

test('연결 거래처 단가로 달력 기본 운송료가 계산되고 1회 단가 입력은 없다', async () => {
  const ownerKey = 'test-calendar-unitprice-owner'
  const dateKey = '2026-08-06'
  const monthKey = '2026-08'

  commitClients(ownerKey, [
    { id: 'client-1', companyName: '테스트거래처', fixedRouteLinked: true, fixedUnitPrice: 10000 },
  ], { syncToCloud: false })
  commitWorkData(ownerKey, { [dateKey]: { isOff: false, fixedCount: 3, callDetails: [] } }, { syncToCloud: false })
  commitSettings(ownerKey, normalizeSettings({ unitPrice: 5000 }), { syncToCloud: false })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(
        MemoryRouter,
        { initialEntries: ['/app?y=2026&m=7'] },
        React.createElement(CalendarPage, { ownerKey, onSelectDay: () => {} }),
      ))
    })

    assert.equal(container.querySelector('.summary-price-input'), null, '정산 카드에 1회 단가 입력이 없어야 한다')
    assert.equal(container.textContent.includes('1회 단가'), false)
    assert.ok(
      container.textContent.includes('30,000 원'),
      `3회×거래처 10,000원=30,000원이어야 한다 — 실제: ${container.textContent.slice(0, 400)}`,
    )

    await act(async () => {
      commitClients(ownerKey, [
        { id: 'client-1', companyName: '테스트거래처', fixedRouteLinked: true, fixedUnitPrice: 15000 },
      ], { syncToCloud: false })
    })
    assert.ok(
      container.textContent.includes('45,000 원'),
      `거래처 단가 변경 후 3회×15,000원=45,000원이어야 한다 — 실제: ${container.textContent.slice(0, 400)}`,
    )

    const revenue = getMonthlyFareRevenue(
      monthKey,
      { cars: [], clients: getState().clients[ownerKey] },
      { main: getState().workLogs[ownerKey]?.main || {} },
    )
    assert.equal(revenue.totalFare, 45000)
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('고정노선 거래처가 없으면 정산 카드에 1회 단가가 없고 설정 단가를 쓰지 않는다', async () => {
  const ownerKey = 'test-calendar-unitprice-no-client'
  commitClients(ownerKey, [], { syncToCloud: false })
  commitWorkData(ownerKey, { '2026-08-06': { isOff: false, fixedCount: 3, callDetails: [] } }, { syncToCloud: false })
  commitSettings(ownerKey, normalizeSettings({ unitPrice: 5000 }), { syncToCloud: false })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(
        MemoryRouter,
        { initialEntries: ['/app?y=2026&m=7'] },
        React.createElement(CalendarPage, { ownerKey, onSelectDay: () => {} }),
      ))
    })
    assert.equal(container.querySelector('.summary-price-input'), null)
    assert.equal(container.textContent.includes('1회 단가'), false)
    assert.equal(container.textContent.includes('15,000 원'), false, '설정 unitPrice 5,000×3회를 쓰면 안 된다')
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('홈 월간 정산 카드의 운임 수수료 = 매출 income.commission.total, 합계는 그만큼 차감', async () => {
  const ownerKey = 'test-calendar-commission-owner'
  const dateKey = '2026-08-10'
  const monthKey = '2026-08'

  commitClients(ownerKey, [
    {
      id: 'client-comm', companyName: '수수료거래처', fixedRouteLinked: true, fixedUnitPrice: 10000,
      commEnabled: true, commType: 'percent', commValue: 10,
    },
  ], { syncToCloud: false })
  commitWorkData(ownerKey, {
    [dateKey]: { isOff: false, fixedCount: 0, callDetails: [{ id: 'call-comm', client: '수수료거래처', fare: 100000 }] },
  }, { syncToCloud: false })

  const workDataByLogId = { main: getState().workLogs[ownerKey]?.main || {} }
  const revenueDetail = getOwnerMonthlyFinanceDetail(monthKey, 'owner', buildFinanceSettings(ownerKey), workDataByLogId, [])
  const commissionTotal = revenueDetail.income.commission.total
  assert.equal(commissionTotal, 10000, '거래처 10% × 운임 100,000 = 10,000')

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(
        MemoryRouter,
        { initialEntries: ['/app?y=2026&m=7'] },
        React.createElement(CalendarPage, { ownerKey, onSelectDay: () => {} }),
      ))
    })

    assert.ok(container.textContent.includes('운임 수수료'), '정산 카드에 운임 수수료 행이 있어야 한다')
    assert.ok(
      container.textContent.includes(`-${commissionTotal.toLocaleString('ko-KR')} 원`),
      `운임 수수료 금액이 매출과 같은 -${commissionTotal.toLocaleString('ko-KR')} 원이어야 한다 — 실제: ${container.textContent.slice(0, 500)}`,
    )

    const fareSummary = monthWorkFareSummary(workDataByLogId.main, 2026, 7, 10000)
    const settledTotal = fareSummary.total - commissionTotal
    const totalRow = container.querySelector('.summary-row.total .summary-value')
    assert.equal(
      totalRow?.textContent,
      `${settledTotal.toLocaleString('ko-KR')} 원`,
      `합계는 운임+부가세(${fareSummary.total.toLocaleString('ko-KR')})에서 수수료를 뺀 ${settledTotal.toLocaleString('ko-KR')} 원이어야 한다`,
    )
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('driverExpenses가 있어도 owner scope income.commission.total은 불변(홈 정산 SoT)', () => {
  const ownerKey = 'test-calendar-commission-driver-exp'
  const dateKey = '2026-08-10'
  const monthKey = '2026-08'
  commitClients(ownerKey, [
    {
      id: 'client-comm2', companyName: '수수료거래처2', fixedRouteLinked: true, fixedUnitPrice: 10000,
      commEnabled: true, commType: 'percent', commValue: 10,
    },
  ], { syncToCloud: false })
  commitWorkData(ownerKey, {
    [dateKey]: { isOff: false, fixedCount: 0, callDetails: [{ id: 'call-comm2', client: '수수료거래처2', fare: 100000 }] },
  }, { syncToCloud: false })
  const workDataByLogId = { main: getState().workLogs[ownerKey]?.main || {} }
  const settings = buildFinanceSettings(ownerKey)
  const driverExpenses = [
    { id: 'drv-m', kind: 'maint', date: '2026-08-10', name: '기사정비', cost: 99999, vehicleNumber: '서울12가3456' },
  ]
  const without = getOwnerMonthlyFinanceDetail(monthKey, 'owner', settings, workDataByLogId, [], [])
  const withDriver = getOwnerMonthlyFinanceDetail(monthKey, 'owner', settings, workDataByLogId, [], driverExpenses)
  assert.equal(without.income.commission.total, 10000)
  assert.equal(withDriver.income.commission.total, without.income.commission.total)
  assert.equal(withDriver.expense.maint.total, 0, 'owner scope는 driverExpenses를 비용에 넣지 않는다')
})

test('수수료가 없으면 정산 카드에 운임 수수료 행이 없고 합계는 monthWorkFareSummary.total과 같다', async () => {
  const ownerKey = 'test-calendar-commission-zero'
  const dateKey = '2026-08-12'

  commitClients(ownerKey, [
    { id: 'client-nocomm', companyName: '무수수료거래처', fixedRouteLinked: true, fixedUnitPrice: 10000 },
  ], { syncToCloud: false })
  commitWorkData(ownerKey, {
    [dateKey]: { isOff: false, fixedCount: 2, callDetails: [] },
  }, { syncToCloud: false })

  const workDataByLogId = { main: getState().workLogs[ownerKey]?.main || {} }
  const revenueDetail = getOwnerMonthlyFinanceDetail('2026-08', 'owner', buildFinanceSettings(ownerKey), workDataByLogId, [])
  assert.equal(revenueDetail.income.commission.total, 0)

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(
        MemoryRouter,
        { initialEntries: ['/app?y=2026&m=7'] },
        React.createElement(CalendarPage, { ownerKey, onSelectDay: () => {} }),
      ))
    })

    assert.equal(container.textContent.includes('운임 수수료'), false, '수수료 0이면 행을 숨긴다')
    const fareSummary = monthWorkFareSummary(workDataByLogId.main, 2026, 7, 10000)
    const totalRow = container.querySelector('.summary-row.total .summary-value')
    assert.equal(
      totalRow?.textContent,
      `${fareSummary.total.toLocaleString('ko-KR')} 원`,
      '합계는 기존 monthWorkFareSummary.total과 같아야 한다',
    )
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('년/월 커스텀 드롭다운은 listbox로 열리고 선택하면 쿼리가 유지된다', async () => {
  const ownerKey = 'cal-date-select-owner'
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(
        MemoryRouter,
        { initialEntries: ['/app?y=2026&m=7'] },
        React.createElement(CalendarPage, { ownerKey, onSelectDay: () => {} }),
      ))
    })
    const yearBtn = container.querySelector('[aria-label="년도 선택"]')
    assert.ok(yearBtn instanceof window.HTMLButtonElement)
    await act(async () => { yearBtn.click() })
    const list = container.querySelector('[role="listbox"]')
    assert.ok(list)
    assert.equal(list.hasAttribute('hidden'), false)
    const options = container.querySelectorAll('[role="option"]')
    assert.ok(options.length > 4)
    await act(async () => {
      options[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    assert.equal(container.querySelector('[role="listbox"]')?.hasAttribute('hidden'), true)
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
