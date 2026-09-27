// 로드맵 4-2 — 기사 관리 정산 요약 카드: 총 운송료 / 기사 정산금 / 산재보험(기사 몫) / 원천징수(3.3%) / 최종 실수령.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: SettlementSummaryCard } = await import('./SettlementSummaryCard.jsx')

/** @param {Record<string, unknown>|null} detail */
async function render(detail) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(SettlementSummaryCard, {
      viewDate: new Date(2026, 4, 1), onPrevMonth: () => {}, onNextMonth: () => {}, onYearChange: () => {}, onMonthChange: () => {}, detail,
    }))
  })
  /** @type {Record<string, string>} */
  const rows = {}
  container.querySelectorAll('.summary-row').forEach((row) => {
    const [label, value] = [...row.querySelectorAll('span')].map((span) => span.textContent ?? '')
    rows[label] = value
  })
  return { rows, async cleanup() { await act(async () => { root.unmount() }); container.remove() } }
}

test('매출제 20% 사업소득자(둘 다 ON): 운송료 1,000,000 → 정산금 200,000, 산재 1,251, 3.3% 6,600, 실수령 192,149', async () => {
  const car = { number: '12가3456', driverPayMode: 'revenue', insuranceOn: true, withholdingOn: true }
  const view = await render({ tripCount: 3, totalFare: 1000000, commissionAmount: 200000, car })
  try {
    assert.equal(view.rows['총 운송료'], '1,000,000원')
    assert.equal(view.rows['기사 정산금'], '200,000원')
    assert.equal(view.rows['산재보험 (기사 몫)'], '-1,251원')
    assert.equal(view.rows['원천징수 (3.3%)'], '-6,600원')
    assert.equal(view.rows['최종 실수령 정산액'], '192,149원')
    assert.equal(Object.keys(view.rows).includes('수수료'), false, '옛 "수수료" 줄은 기사 정산금으로 바뀌었다')
  } finally { await view.cleanup() }
})

test('월급제 4대보험 근로자(둘 다 OFF): 월급 그대로, 기사 공제 0', async () => {
  const car = { number: '12가3456', driverPayMode: 'salary', driverSalaryAmount: '2000000', driverIncomeType: 'employee', insuranceOn: false, withholdingOn: false }
  const view = await render({ tripCount: 1, totalFare: 500000, commissionAmount: 0, car })
  try {
    assert.equal(view.rows['기사 정산금'], '2,000,000원')
    assert.equal(view.rows['산재보험 (기사 몫)'], '-0원')
    assert.equal(view.rows['원천징수 (3.3%)'], '-0원')
    assert.equal(view.rows['최종 실수령 정산액'], '2,000,000원')
  } finally { await view.cleanup() }
})

test('detail이 없으면 전부 0원으로 안전하게 그린다', async () => {
  const view = await render(null)
  try {
    assert.equal(view.rows['최종 실수령 정산액'], '0원')
  } finally { await view.cleanup() }
})
