import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../testSupport/stubSupabaseClient.js'
import '../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { default: ReportPage } = await import('./ReportPage.jsx')
const { default: TaxInvoicePage } = await import('./TaxInvoicePage.jsx')
const { commitClients, commitInvoices, commitWorkData } = await import('../store/commitHelpers.js')

test('일지를 커밋하면 운송비 내역서가 리마운트 없이 합계를 갱신한다', async () => {
  const ownerKey = 'sot-workdata-report'
  const now = new Date()
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`
  commitClients(ownerKey, [
    { id: 'c-sot', companyName: '소트거래처', fixedRouteLinked: true, fixedUnitPrice: 10000 },
  ], { syncToCloud: false })
  commitWorkData(ownerKey, {}, { syncToCloud: false })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(ReportPage, { ownerKey, onBack: () => {} }))
    })
    assert.ok(container.textContent.includes('월간 총 운행거리'), '요약 화면에 거리 행이 있어야 한다')
    assert.equal(container.textContent.includes('소트거래처 기본 운송료'), false)

    await act(async () => {
      commitWorkData(ownerKey, {
        [dateKey]: { isOff: false, fixedCount: 4 },
      }, { syncToCloud: false })
    })
    assert.ok(
      container.textContent.includes('소트거래처 기본 운송료'),
      'loadWorkData 스냅샷이면 리마운트 없이 거래처 매출이 안 바뀐다',
    )
    assert.ok(
      container.textContent.includes('40,000 원'),
      '4회×10,000원이 리마운트 없이 반영돼야 한다',
    )
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})

test('계산서를 커밋하면 세금계산서 발급 목록이 리마운트 없이 갱신한다', async () => {
  const ownerKey = 'sot-invoices-tax'
  const now = new Date()
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  commitInvoices(ownerKey, [], { syncToCloud: false })

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(React.createElement(TaxInvoicePage, { ownerKey, onBack: () => {} }))
    })
    const issuedTab = [...container.querySelectorAll('button')].find((el) => el.textContent.includes('발급 완료'))
    assert.ok(issuedTab, '발급 완료 탭이 있어야 한다')
    await act(async () => { issuedTab.click() })

    await act(async () => {
      commitInvoices(ownerKey, [{
        id: `sales|${monthKey}|sot-client`,
        flow: 'sales',
        monthKey,
        status: 'issued',
        clientName: '소트계산서거래처',
        supplyAmount: 10000,
        taxAmount: 1000,
      }], { syncToCloud: false })
    })
    assert.ok(
      container.textContent.includes('소트계산서거래처'),
      'loadInvoices 스냅샷이면 리마운트 없이 발급 목록이 안 바뀐다',
    )
  } finally {
    await act(async () => { root.unmount() })
    container.remove()
  }
})
