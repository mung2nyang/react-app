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
  test('매출제(%) → 이번 달 정산액 N%', () => {
    assert.equal(driverSelfNetProfitLabel({ label: '기사 정산(30%)', payMode: 'percent' }), '이번 달 정산액 30%')
    assert.equal(driverSelfNetProfitLabel({ label: '기사 정산(15%)' }), '이번 달 정산액 15%')
  })

  test('매출제(건당·비율 미확정) → 퍼센트 없이 이번 달 정산액', () => {
    assert.equal(driverSelfNetProfitLabel({ label: '기사 정산' }), '이번 달 정산액')
  })

  test('월급제 → 이번 달 월급', () => {
    assert.equal(driverSelfNetProfitLabel({ label: '기사 정산(월급)', payMode: 'salary' }), '이번 달 월급')
    assert.equal(driverSelfNetProfitLabel({ label: '기사 정산(월급)' }), '이번 달 월급')
  })

  test('settlement 없으면 이번 달 정산액', () => {
    assert.equal(driverSelfNetProfitLabel({ label: '' }), '이번 달 정산액')
    assert.equal(driverSelfNetProfitLabel(undefined), '이번 달 정산액')
    assert.equal(driverSelfNetProfitLabel(null), '이번 달 정산액')
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
        total: 450000,
        fare: { total: 450000, items: [{ label: '대한', amount: 200000 }] },
        commission: { total: 0, items: [] },
        fuelSubsidy: { total: 5000, items: [{ date: '2026-05-10', label: '주유', amount: 5000 }] },
        settlement: {
          total: 64500,
          items: [{ date: '2026-05-01', label: '김기사', amount: 64500 }],
          label: '기사 정산(15%)',
          payMode: null,
        },
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

  test('매출제: 이번 달 정산액·유가보조금 숨김·합계는 운송료−수수료', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => {
        root.render(React.createElement(OwnerMonthlyCards, { detail: sampleDetail(), variant: 'driverSelf' }))
      })
      const text = container.textContent || ''
      assert.ok(text.includes('이번 달 정산액'), text.slice(0, 200))
      assert.equal(text.includes('당월 순이익'), false)
      assert.ok(!text.includes('유가보조금'), '유가보조금 라인이 없어야 한다')
      assert.ok(!text.includes('기사 급여'), '기사 급여 라인이 없어야 한다')
      assert.ok(text.includes('운송료'), '운송료는 유지')
      assert.ok(text.includes('450,000원'), '합계는 운송료−수수료(450000−0)')
    } finally {
      root.unmount()
      container.remove()
    }
  })

  test('월급제: 이번 달 월급 라벨', async () => {
    const detail = sampleDetail()
    detail.income.settlement = {
      total: 2000000,
      items: [],
      label: '기사 정산(월급)',
      payMode: 'salary',
    }
    detail.netProfit = 2000000
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      await act(async () => {
        root.render(React.createElement(OwnerMonthlyCards, { detail, variant: 'driverSelf' }))
      })
      assert.ok(container.textContent?.includes('이번 달 월급'))
      assert.equal(container.textContent?.includes('당월 순이익'), false)
    } finally {
      root.unmount()
      container.remove()
    }
  })
})
