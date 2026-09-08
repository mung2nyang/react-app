// ReportSummaryContent — 원본 리포트 요약(일자표·거리·거래처별).
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

const baseReport = {
  monthIndex: 8,
  days: [],
  showPallet: false,
  distanceKm: 0,
  fixedBaseFare: 20000,
  defaultBaseFare: 5000,
  fareByClient: { 한진: 100000 },
  commissionByClient: { 한진: 10000 },
  commissionLabelByClient: { 한진: '10%' },
  vat: 12500,
  total: 127500,
}

/**
 * @param {Partial<typeof baseReport>} [reportPatch]
 * @param {{ isExporting?: boolean }} [extra]
 */
async function renderSummary(reportPatch = {}, extra = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(ReportSummaryContent, {
      title: '2026년 9월 운송비 내역서',
      profile: { name: '차주', phone: '010' },
      car: { number: '12가3456', tonnage: '5' },
      report: { ...baseReport, ...reportPatch },
      dash,
      formatWon,
      isExporting: extra.isExporting ?? false,
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

test('요약 화면: 거리·거래처별 행, 1회단가·지출·타이틀 없음', async () => {
  const { container, cleanup } = await renderSummary()
  try {
    const text = container.textContent || ''
    assert.ok(text.includes('월간 총 운행거리'))
    assert.ok(text.includes('한진 수수료 (10%)'))
    assert.equal(text.includes('월간 운송료 정산'), false)
    assert.equal(text.includes('1회 단가'), false)
    assert.equal(text.includes('차량 정비비'), false)
  } finally {
    await cleanup()
  }
})

test('일자별 표 — 정상 행·휴무·파렛트 컬럼 on/off', async () => {
  const days = [
    { day: 1, isOff: false, workVal: 2, palletCount: 3, amount: 25000 },
    { day: 2, isOff: true, workVal: 0, palletCount: 0, amount: 0 },
  ]
  const withPallet = await renderSummary({ days, showPallet: true })
  try {
    const text = withPallet.container.textContent || ''
    assert.ok(text.includes('9월 1일'))
    assert.ok(text.includes('2회'))
    assert.ok(text.includes('3장'))
    assert.ok(text.includes('25,000원'))
    assert.ok(text.includes('휴무'))
    assert.ok(text.includes('파렛트'))
    assert.equal(withPallet.container.querySelectorAll('.report-table').length, 1)
  } finally {
    await withPallet.cleanup()
  }

  const noPallet = await renderSummary({ days, showPallet: false })
  try {
    assert.equal(noPallet.container.textContent.includes('파렛트'), false)
    assert.equal(noPallet.container.textContent.includes('3장'), false)
  } finally {
    await noPallet.cleanup()
  }
})

test('빈 달이면 해당 월의 운송 내역이 없습니다.', async () => {
  const { container, cleanup } = await renderSummary({ days: [] })
  try {
    assert.ok(container.textContent.includes('해당 월의 운송 내역이 없습니다.'))
  } finally {
    await cleanup()
  }
})

test('isExporting이면 일자표를 2단으로 나눈다', async () => {
  const days = [
    { day: 1, isOff: false, workVal: 1, palletCount: 0, amount: 1000 },
    { day: 2, isOff: false, workVal: 1, palletCount: 0, amount: 2000 },
    { day: 3, isOff: false, workVal: 1, palletCount: 0, amount: 3000 },
  ]
  const { container, cleanup } = await renderSummary({ days }, { isExporting: true })
  try {
    assert.ok(container.querySelector('.report-split-container'))
    assert.equal(container.querySelectorAll('.report-split-column').length, 2)
    assert.equal(container.querySelectorAll('.report-table').length, 2)
    assert.ok(container.textContent.includes('9월 1일'))
    assert.ok(container.textContent.includes('9월 3일'))
  } finally {
    await cleanup()
  }
})
