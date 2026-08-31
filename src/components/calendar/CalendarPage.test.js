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
const { getMonthlyFareRevenue } = await import('../../domain/finance.js')

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
