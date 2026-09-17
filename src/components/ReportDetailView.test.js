// ReportDetailContent — 세부내역서 본문(타이틀·총 회수·표).
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const ReportDetailContent = (await import('./ReportDetailView.jsx')).default

const baseReport = {
  items: [
    { dateStr: '9월 1일', loadLoc: '서울', unloadLoc: '부산', client: '한진', fare: 50000 },
    { dateStr: '9월 2일', loadLoc: '대구', unloadLoc: '광주', client: '한진', fare: 30000 },
  ],
  defaultBaseFare: 0,
  monthFareByClient: { 한진: 80000 },
  monthCommByClient: { 한진: 0 },
  clientCommLabels: { 한진: '0%' },
  vat: 8000,
  grandTotal: 88000,
}

/**
 * @param {Partial<typeof baseReport>} [reportPatch]
 * @param {{ clientFilter?: string, showClientColumn?: boolean, profile?: object, car?: object|null }} [extra]
 */
async function renderDetail(reportPatch = {}, extra = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(ReportDetailContent, {
      report: { ...baseReport, ...reportPatch },
      clientFilter: extra.clientFilter ?? 'ALL',
      showClientColumn: extra.showClientColumn ?? true,
      profile: extra.profile ?? {
        name: '차주',
        phone: '010',
        bankName: '국민',
        accountNumber: '123-456-789012',
        accountHolder: '홍길동',
      },
      car: extra.car !== undefined ? extra.car : { number: '12가3456', tonnage: '5' },
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

test('세부내역서: 본문 report-title 없고 총 N회 운행 표시', async () => {
  const { container, cleanup } = await renderDetail()
  try {
    const text = container.textContent || ''
    assert.equal(container.querySelector('.report-title'), null)
    assert.equal(text.includes('운송비 내역서'), false)
    assert.ok(text.includes('세부 운송료 정산 (전체)'))
    assert.ok(text.includes('총 2회 운행'))
  } finally {
    await cleanup()
  }
})

test('세부내역서: 특정 거래처 필터면 라벨·회수 반영', async () => {
  const { container, cleanup } = await renderDetail(
    { items: [baseReport.items[0]] },
    { clientFilter: '한진', showClientColumn: false },
  )
  try {
    const text = container.textContent || ''
    assert.ok(text.includes('세부 운송료 정산 (한진)'))
    assert.ok(text.includes('총 1회 운행'))
  } finally {
    await cleanup()
  }
})

test('세부내역서: info-table에 성명·차량번호·계좌 배치 반영', async () => {
  const { container, cleanup } = await renderDetail()
  try {
    const table = container.querySelector('.info-table')
    assert.ok(table)
    const text = table.textContent || ''
    assert.ok(text.includes('성명'))
    assert.ok(text.includes('차주'))
    assert.ok(text.includes('차량번호'))
    assert.ok(text.includes('12가3456'))
    assert.ok(text.includes('입금은행'))
    assert.ok(text.includes('예금주'))
    assert.ok(text.includes('홍길동'))
    assert.ok(text.includes('계좌번호'))
    assert.ok(text.includes('123-456-789012'))
    const rows = [...table.querySelectorAll('tr')]
    assert.ok((rows[2].textContent || '').includes('예금주'))
    assert.ok((rows[3].textContent || '').includes('계좌번호'))
  } finally {
    await cleanup()
  }
})

test('report.css: info-table th·report-table td 중앙정렬, detail-amount right 없음', () => {
  const cssPath = join(dirname(fileURLToPath(import.meta.url)), 'report', 'report.css')
  const css = readFileSync(cssPath, 'utf8')
  assert.ok(/\.info-table th\s*\{[^}]*text-align:\s*center/s.test(css))
  assert.ok(/\.report-table td\s*\{[^}]*text-align:\s*center/s.test(css))
  assert.equal(/\.detail-amount-cell\s*\{[^}]*text-align:\s*right/s.test(css), false)
  assert.equal(css.includes(':not(.detail-report-table)'), false)
  assert.ok(css.includes('.report-top-card'))
  assert.ok(css.includes('.report-pdf-actions .theme-toggle-btn'))
  assert.equal(css.includes('.report-title'), false)
})
