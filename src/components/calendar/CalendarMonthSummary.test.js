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
    subCarCommLabel: '기사 차량 수수료',
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
    assert.ok(text.includes('5,000원'))
    assert.ok(text.includes('미지정 거래처 운송료'))
    assert.ok(text.includes('3,000원'))
    assert.ok(text.includes('한진 기본 운송료'))
    assert.ok(text.includes('한진 수수료 (10%)'))
    assert.ok(text.includes('- 10,000원'))
    assert.ok(shown.container.querySelector('.summary-client-commission-row'))
    assert.ok(text.includes('파렛트 회수 청구액'))
    assert.ok(text.includes('6,000원'))
    assert.ok(text.includes('3456 차량 10%'))
    assert.ok(text.includes('- 8,000원'))
    assert.ok(text.includes('실 운행거리'))
    assert.ok(text.includes('42 km'))
    assert.ok(text.includes('차량 정비비'))
    assert.ok(text.includes('2,000원'))
    assert.ok(text.includes('차량 주유비'))
    assert.ok(text.includes('1,500원'))
    assert.ok(text.includes('통행료/기타'))
    assert.ok(text.includes('700원'))
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

test('지출 3행 아이콘·색상·구분선과 서브수수료→파렛트 순서', async () => {
  const { container, cleanup } = await renderSummary(emptySummary({
    palletFare: 1000,
    subCarComm: 2000,
    subCarCommLabel: '3456 차량 10%',
    vat: 0,
    total: 0,
    maint: 3000,
    fuel: 4000,
    misc: 5000,
  }))
  try {
    const rows = [...container.querySelectorAll('.summary-card > .summary-row')]
    const labelOf = (row) => (row.textContent || '').replace(/\s+/g, ' ').trim()
    const subIdx = rows.findIndex((r) => labelOf(r).includes('3456 차량 10%'))
    const palletIdx = rows.findIndex((r) => labelOf(r).includes('파렛트 회수 청구액'))
    const maintIdx = rows.findIndex((r) => labelOf(r).includes('차량 정비비'))
    const fuelIdx = rows.findIndex((r) => labelOf(r).includes('차량 주유비'))
    const miscIdx = rows.findIndex((r) => labelOf(r).includes('통행료/기타'))
    assert.ok(subIdx >= 0 && palletIdx >= 0)
    assert.ok(subIdx < palletIdx, '서브차량 수수료 행이 파렛트 행보다 위여야 한다')
    assert.ok(maintIdx < fuelIdx && fuelIdx < miscIdx)

    const maintRow = rows[maintIdx]
    assert.equal(maintRow.style.marginTop, '8px')
    assert.equal(maintRow.style.paddingTop, '8px')
    assert.ok(maintRow.classList.contains('summary-expense-first'), '정비비 행 위에 구분선 클래스가 있어야 한다')
    assert.ok(maintRow.querySelector('svg.inline-icon.sm path'))

    const fuelRow = rows[fuelIdx]
    assert.equal(fuelRow.style.color, 'var(--primary-color)')
    assert.equal(fuelRow.querySelectorAll('svg.inline-icon.sm line').length, 2)
    assert.ok(fuelRow.querySelectorAll('svg.inline-icon.sm path').length >= 2)

    const miscRow = rows[miscIdx]
    assert.equal(miscRow.style.color, 'var(--sunday-color)')
    assert.ok(miscRow.querySelector('svg.inline-icon.sm path'))

    for (const row of [maintRow, fuelRow, miscRow]) {
      const label = row.querySelector('span')
      assert.ok(label)
      assert.equal(label.style.display, 'flex')
      assert.equal(label.style.alignItems, 'center')
      assert.equal(label.style.gap, '4px')
    }
  } finally {
    await cleanup()
  }
})

/** @param {Element} root @param {string} name */
function infoButton(root, name) {
  return [...root.querySelectorAll('.summary-info-btn')].find((btn) => (btn.getAttribute('aria-label') || '').startsWith(`${name} 설명`))
}

test('로드맵 12번: 합계 (i)을 누르면 설명이 펼쳐지고 다시 누르면 접힌다', async () => {
  const { container, cleanup } = await renderSummary(emptySummary({ vat: 1000, total: 11000, maint: 3000 }))
  try {
    const btn = infoButton(container, '합계')
    assert.ok(btn instanceof window.HTMLButtonElement, '합계 줄에 (i) 버튼')
    assert.equal(btn.getAttribute('aria-expanded'), 'false')
    assert.equal(container.querySelector('.summary-info-text'), null)
    await act(async () => { btn.click() })
    assert.equal(btn.getAttribute('aria-expanded'), 'true')
    const text = container.querySelector('.summary-info-text')
    assert.ok(text?.textContent?.includes('합계에서 빼지 않은 이번 달 차량 지출'))
    assert.equal(btn.getAttribute('aria-controls'), text?.id)
    await act(async () => { btn.click() })
    assert.equal(btn.getAttribute('aria-expanded'), 'false')
    assert.equal(container.querySelector('.summary-info-text'), null)
  } finally {
    await cleanup()
  }
})

test('로드맵 12번: 수수료 있는 거래처 줄에만 (i), 설명에 그 설정 값(% / 건당 금액)', async () => {
  const { container, cleanup } = await renderSummary(emptySummary({
    fareByClient: { 한진: 100000, 대한: 50000, 무수료: 30000 },
    commissionByClient: { 한진: 10000, 대한: 6000 },
    commissionLabelByClient: { 한진: '10%', 대한: '3,000원' },
    vat: 18000,
    total: 182000,
  }))
  try {
    assert.equal(infoButton(container, '무수료 수수료'), undefined, '수수료 없는 거래처엔 (i) 없음')
    const hanjin = infoButton(container, '한진 수수료')
    const daehan = infoButton(container, '대한 수수료')
    assert.ok(hanjin && daehan)
    await act(async () => { hanjin.click(); daehan.click() })
    const texts = [...container.querySelectorAll('.summary-info-text')].map((el) => el.textContent || '')
    assert.ok(texts.some((t) => t.includes('수수료(10%)만큼 이 거래처 운송료에서 뺍니다')))
    assert.ok(texts.some((t) => t.includes('수수료(건당 3,000원)만큼')))
    assert.ok((container.textContent || '').includes('한진 수수료 (10%)'), '줄 이름은 그대로')
  } finally {
    await cleanup()
  }
})

test('로드맵 12번: 기사차량 수수료가 있을 때만 그 줄에 (i), 설명에 차량 설정 값', async () => {
  const none = await renderSummary(emptySummary({ vat: 0, total: 0 }))
  try {
    assert.equal(infoButton(none.container, '기사 차량 수수료'), undefined)
  } finally {
    await none.cleanup()
  }
  const shown = await renderSummary(emptySummary({ subCarComm: 8000, subCarCommLabel: '3456 차량 건당 5,000원', vat: 0, total: 0 }))
  try {
    const btn = infoButton(shown.container, '기사 차량 수수료')
    assert.ok(btn)
    await act(async () => { btn.click() })
    assert.ok((shown.container.querySelector('.summary-info-text')?.textContent || '').includes('이 차량의 수수료(건당 5,000원)입니다'))
  } finally {
    await shown.cleanup()
  }
})

test('문구 정리 4-B: 기본 이름 "기사 차량 수수료"면 설명에 "(수수료)"가 붙지 않고, "3456 차량 10%"는 "(10%)"', async () => {
  const plain = await renderSummary(emptySummary({ subCarComm: 8000, vat: 0, total: 0 }))
  try {
    const btn = infoButton(plain.container, '기사 차량 수수료')
    assert.ok(btn)
    await act(async () => { btn.click() })
    const text = plain.container.querySelector('.summary-info-text')?.textContent || ''
    assert.ok(text.includes('이 차량의 수수료입니다'), text)
    assert.ok(!text.includes('(수수료)'), text)
  } finally {
    await plain.cleanup()
  }
  const rate = await renderSummary(emptySummary({ subCarComm: 8000, subCarCommLabel: '3456 차량 10%', vat: 0, total: 0 }))
  try {
    const btn = infoButton(rate.container, '기사 차량 수수료')
    assert.ok(btn)
    await act(async () => { btn.click() })
    assert.ok((rate.container.querySelector('.summary-info-text')?.textContent || '').includes('이 차량의 수수료(10%)입니다'))
  } finally {
    await rate.cleanup()
  }
})
