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
const { readJsonKey } = await import('../../store/persist.js')
const { normalizeSettings } = await import('../../domain/practiceSettings.js')
const { getMonthlyFareRevenue } = await import('../../domain/finance.js')

function setNativeInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
}

test('재감사 3차 — 연결 거래처가 있으면 단가 편집이 그 거래처 fixedUnitPrice를 고치고 달력·매출 합계가 함께 갱신된다', async () => {
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

    const priceInput = container.querySelector('.summary-price-input')
    assert.ok(priceInput, '1회 단가 입력을 찾아야 한다')
    assert.equal(priceInput.value, '10,000', '연결 거래처의 fixedUnitPrice(10,000)로 초기화돼야 한다 — settings.unitPrice(5,000)가 아니다')
    assert.ok(
      container.textContent.includes("테스트거래처"),
      '연결 거래처 이름을 안내하는 힌트가 렌더돼야 한다',
    )

    await act(async () => { setNativeInputValue(priceInput, '15000') })

    // 1) Store — 연결 거래처의 fixedUnitPrice가 원자적으로 바뀌었다(settings.unitPrice는 그대로).
    const updatedClient = getState().clients[ownerKey].find((c) => c.id === 'client-1')
    assert.equal(updatedClient.fixedUnitPrice, 15000, 'Store의 거래처 fixedUnitPrice가 15000으로 바뀌어야 한다')
    assert.equal(getState().settings[ownerKey]?.unitPrice, 5000, 'fallback settings.unitPrice는 그대로여야 한다(몰래 고치면 안 된다)')

    // 2) localStorage — 같은 원자적 커밋으로 실제 저장소에도 반영된다.
    const storedClients = readJsonKey('clients', ownerKey, [])
    assert.equal(storedClients.find((c) => c.id === 'client-1')?.fixedUnitPrice, 15000, 'localStorage에도 반영돼야 한다')

    // 3) 달력 합계(이 화면의 "기본 운송료"/"합계" 카드)가 새 단가(15000×3회=45,000)로 다시 렌더된다.
    assert.ok(priceInput.value === '15,000', '입력 자체도 새 값을 보여줘야 한다')
    assert.ok(
      container.textContent.includes('45,000 원'),
      `기본 운송료가 3회×15,000원=45,000원으로 갱신돼야 한다 — 실제 텍스트 일부: ${container.textContent.slice(0, 400)}`,
    )

    // 4) 매출 합계(RevenuePage/DriverRevenueView가 쓰는 것과 같은 getMonthlyFareRevenue)도
    // 같은 store 데이터에서 새 단가를 반영한다 — 달력과 매출이 같은 단일 소스를 본다는 증거.
    const revenue = getMonthlyFareRevenue(
      monthKey,
      { cars: [], clients: getState().clients[ownerKey] },
      { main: getState().workLogs[ownerKey]?.main || {} },
    )
    assert.equal(revenue.totalFare, 45000, `매출 합계도 새 단가(15000)를 반영해 45000이어야 한다 — 실제: ${revenue.totalFare}`)
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
