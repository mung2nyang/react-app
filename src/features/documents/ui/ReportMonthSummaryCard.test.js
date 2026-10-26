// 운송비 내역서 월간 정산 — "파렛트 회수 청구액" 줄(로드맵 113-D, 달력과 같은 자리·이름).
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatWon } from '../../../domain/money.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { ReportMonthSummaryCard } = await import('./ReportMonthSummaryCard.jsx')

const baseReport = {
  distanceKm: 0,
  trips: 2,
  callTrips: 0,
  fixedBaseFare: 0,
  defaultBaseFare: 0,
  fareByClient: { 한진: 500000 },
  commissionByClient: {},
  commissionLabelByClient: {},
  palletFare: 10000,
  vat: 51000,
  total: 561000,
}

/** @param {Partial<typeof baseReport>} [patch] */
async function rowTexts(patch = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(ReportMonthSummaryCard, { report: { ...baseReport, ...patch }, formatWon }))
  })
  const rows = [...container.querySelectorAll('.summary-row')].map((row) => row.textContent)
  await act(async () => root.unmount())
  container.remove()
  return rows
}

test('파렛트 금액이 있으면 거래처 줄 다음·부가세 앞에 "파렛트 회수 청구액" 줄', async () => {
  const rows = await rowTexts()
  const pallet = rows.indexOf('파렛트 회수 청구액10,000원')
  assert.ok(pallet > rows.findIndex((text) => text.startsWith('한진 기본 운송료')), rows.join(' | '))
  assert.ok(pallet < rows.findIndex((text) => text.startsWith('부가세')), rows.join(' | '))
})

test('파렛트 금액이 0이면 줄이 없다', async () => {
  const rows = await rowTexts({ palletFare: 0 })
  assert.equal(rows.some((text) => text.startsWith('파렛트')), false)
})
