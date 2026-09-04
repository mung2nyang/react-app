import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { driverSelfNetProfitLabel } from './revenueFormat.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: OwnerMonthlyCards } = await import('./OwnerMonthlyCards.jsx')

describe('driverSelfNetProfitLabel', () => {
  test('매출제 라벨 → 당월 순이익 (30%)', () => {
    assert.equal(driverSelfNetProfitLabel({ label: '기사 정산(30%)' }), '당월 순이익 (30%)')
    assert.equal(driverSelfNetProfitLabel({ label: '기사 정산(15%)' }), '당월 순이익 (15%)')
  })

  test('월급제 라벨 → 당월 순이익 (월급)', () => {
    assert.equal(driverSelfNetProfitLabel({ label: '기사 정산(월급)' }), '당월 순이익 (월급)')
  })

  test('정산율 없으면 당월 순이익만', () => {
    assert.equal(driverSelfNetProfitLabel({ label: '기사 정산' }), '당월 순이익')
    assert.equal(driverSelfNetProfitLabel({ label: '' }), '당월 순이익')
    assert.equal(driverSelfNetProfitLabel(undefined), '당월 순이익')
    assert.equal(driverSelfNetProfitLabel(null), '당월 순이익')
  })
})

describe('OwnerMonthlyCards variant=driverSelf', () => {
  function sampleDetail() {
    return {
      monthKey: '2026-05',
      tripCount: 2,
      distanceKm: 40,
      durationHours: 1,
      vatAmount: 10000,
      netProfit: 64500,
      income: {
        total: 64500,
        fare: { total: 450000, items: [{ label: '대한', amount: 200000 }] },
        commission: { total: 0, items: [] },
        fuelSubsidy: { total: 5000, items: [{ date: '2026-05-10', label: '주유', amount: 5000 }] },
        settlement: { total: 64500, items: [{ date: '2026-05-01', label: '김기사', amount: 64500 }], label: '기사 정산(15%)' },
      },
      expense: {
        total: 0,
        maint: { total: 0, items: [] },
        fuel: { total: 0, items: [] },
        misc: { total: 0, items: [] },
        salary: { total: 0, items: [] },
      },
      unpaid: { total: 0, count: 0, items: [] },
    }
  }

  test('기사 정산·유가보조금 라인 없고 순이익 라벨에 (15%)', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => {
        root.render(React.createElement(OwnerMonthlyCards, { detail: sampleDetail(), variant: 'driverSelf' }))
      })
      const text = container.textContent || ''
      assert.ok(text.includes('당월 순이익 (15%)'), text.slice(0, 200))
      assert.ok(!text.includes('기사 정산'), '기사 정산 라인이 없어야 한다')
      assert.ok(!text.includes('유가보조금'), '유가보조금 라인이 없어야 한다')
      assert.ok(!text.includes('기사 급여'), '기사 급여 라인이 없어야 한다')
      assert.ok(text.includes('운송료'), '운송료는 유지')
    } finally {
      root.unmount()
      container.remove()
    }
  })
})
