// CalendarMonthSummary — 거래처/파렛트/서브수수료/지출 행 표시·숨김.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: CalendarMonthSummary } = await import('./CalendarMonthSummary.jsx')

function emptySummary(overrides = {}) {
  return {
    trips: 0,
    callTrips: 0,
    fixedBaseFare: 0,
    defaultBaseFare: 0,
    fareByClient: {},
    commissionByClient: {},
    commissionLabelByClient: {},
    palletFare: 0,
    subCarComm: 0,
    subCarCommLabel: '기사차량 수수료',
    distanceKm: 0,
    fare: 0,
    commissionTotal: 0,
    vat: 0,
    total: 0,
    maint: 0,
    fuel: 0,
    misc: 0,
    ...overrides,
  }
}

/**
 * @param {ReturnType<typeof emptySummary>} summary
 * @param {{ paymentOn?: boolean, unpaidTotal?: number, distanceOn?: boolean }} [extra]
 */
async function renderSummary(summary, extra = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(CalendarMonthSummary, {
      paymentOn: extra.paymentOn ?? false,
      unpaidTotal: extra.unpaidTotal ?? 0,
      distanceOn: extra.distanceOn ?? false,
      summary,
    }))
  })
  return {
    container,
    async cleanup() {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

test('거래처 수수료·파렛트·서브수수료·지출 행 — 0이면 숨김, 값 있으면 표시', async () => {
  const hidden = await renderSummary(emptySummary({ trips: 1, vat: 1000, total: 11000, fare: 10000 }))
  try {
    assert.equal(hidden.container.textContent.includes('고정 기본 운송료'), false)
    assert.equal(hidden.container.textContent.includes('파렛트'), false)
    assert.equal(hidden.container.textContent.includes('차량 정비비'), false)
    assert.equal(hidden.container.textContent.includes('차량 주유비'), false)
    assert.equal(hidden.container.textContent.includes('통행료/기타'), false)
    assert.equal(hidden.container.querySelector('.summary-client-commission-row'), null)
  } finally {
    await hidden.cleanup()
  }

  const shown = await renderSummary(emptySummary({
    trips: 2,
    callTrips: 1,
    fixedBaseFare: 5000,
    defaultBaseFare: 3000,
    fareByClient: { 한진: 100000 },
    commissionByClient: { 한진: 10000 },
    commissionLabelByClient: { 한진: '10%' },
    palletFare: 6000,
    subCarComm: 8000,
    subCarCommLabel: '3456 차량 10%',
    distanceKm: 42,
    vat: 11100,
    total: 105100,
    maint: 2000,
    fuel: 1500,
    misc: 700,
  }), { distanceOn: true })
  try {
    const text = shown.container.textContent || ''
    assert.ok(text.includes('고정 기본 운송료'))
    assert.ok(text.includes('5,000 원'))
    assert.ok(text.includes('미지정 거래처 운송료'))
    assert.ok(text.includes('3,000 원'))
    assert.ok(text.includes('한진 기본 운송료'))
    assert.ok(text.includes('한진 수수료 (10%)'))
    assert.ok(text.includes('- 10,000 원'))
    assert.ok(shown.container.querySelector('.summary-client-commission-row'))
    assert.ok(text.includes('파렛트 회수 청구액'))
    assert.ok(text.includes('6,000 원'))
    assert.ok(text.includes('3456 차량 10%'))
    assert.ok(text.includes('- 8,000 원'))
    assert.ok(text.includes('실 운행거리'))
    assert.ok(text.includes('42 km'))
    assert.ok(text.includes('차량 정비비'))
    assert.ok(text.includes('2,000 원'))
    assert.ok(text.includes('차량 주유비'))
    assert.ok(text.includes('1,500 원'))
    assert.ok(text.includes('통행료/기타'))
    assert.ok(text.includes('700 원'))
  } finally {
    await shown.cleanup()
  }
})

test('distanceOn이 꺼져 있으면 거리 행을 숨긴다', async () => {
  const { container, cleanup } = await renderSummary(
    emptySummary({ distanceKm: 99, vat: 0, total: 0 }),
    { distanceOn: false },
  )
  try {
    assert.equal(container.textContent.includes('실 운행거리'), false)
  } finally {
    await cleanup()
  }
})
