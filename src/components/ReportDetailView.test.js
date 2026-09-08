// ReportSummaryContent — 원본 리포트 요약 구조(거리·기본운송료·거래처별).
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatWon } from '../domain/money.js'
import { dash } from '../lib/report.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { ReportSummaryContent } = await import('./ReportDetailView.jsx')

test('요약 화면: 거리 항상 표시, 거래처별·수수료 행, 1회단가·지출·타이틀 없음', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(ReportSummaryContent, {
        title: '2026년 9월 운송비 내역서',
        profile: { name: '차주', phone: '010' },
        car: { number: '12가3456', tonnage: '5' },
        report: {
          distanceKm: 0,
          fixedBaseFare: 20000,
          defaultBaseFare: 5000,
          fareByClient: { 한진: 100000 },
          commissionByClient: { 한진: 10000 },
          commissionLabelByClient: { 한진: '10%' },
          vat: 12500,
          total: 127500,
        },
        dash,
        formatWon,
      }))
    })
    const text = container.textContent || ''
    assert.ok(text.includes('월간 총 운행거리'))
    assert.ok(text.includes('0 km'))
    assert.ok(text.includes('기본 운송료'))
    assert.ok(text.includes('25,000 원'))
    assert.ok(text.includes('한진 기본 운송료'))
    assert.ok(text.includes('한진 수수료 (10%)'))
    assert.ok(container.querySelector('.summary-client-commission-row'))
    assert.equal(text.includes('월간 운송료 정산'), false)
    assert.equal(text.includes('1회 단가'), false)
    assert.equal(text.includes('차량 정비비'), false)
    assert.equal(text.includes('차량 주유비'), false)
    assert.equal(text.includes('통행료/기타'), false)
    assert.equal(text.includes('파렛트'), false)
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
