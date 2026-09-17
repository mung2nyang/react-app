// ReportPage — 상단 카드·세부내역서 버튼(detail 모드 유지).
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
const { commitClients, commitWorkData } = await import('../store/commitHelpers.js')

/**
 * @param {string} ownerKey
 */
async function renderReport(ownerKey) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(ReportPage, { ownerKey, onBack: () => {} }))
  })
  return {
    container,
    async cleanup() {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

test('세부 내역서 버튼은 detail 모드에서도 보이고, 다시 누르면 필터 모달이 뜬다', async () => {
  const ownerKey = 'report-page-detail-btn'
  commitClients(ownerKey, [
    { id: 'c1', companyName: '한진', fixedRouteLinked: true, fixedUnitPrice: 10000 },
  ], { syncToCloud: false })
  commitWorkData(ownerKey, {}, { syncToCloud: false })

  const { container, cleanup } = await renderReport(ownerKey)
  try {
    assert.ok(container.querySelector('.report-top-card'))
    const detailBtn = [...container.querySelectorAll('button')].find((el) => el.textContent === '세부 내역서')
    assert.ok(detailBtn, '요약 화면에 세부 내역서 버튼이 있어야 한다')

    await act(async () => { detailBtn.click() })
    assert.ok(container.textContent.includes('세부 내역서 조회'))
    const confirm = [...container.querySelectorAll('button')].find((el) => el.textContent === '조회')
    assert.ok(confirm)
    await act(async () => { confirm.click() })

    assert.ok(container.textContent.includes('세부 운송료 정산'))
    const detailBtnAgain = [...container.querySelectorAll('button')].find((el) => el.textContent === '세부 내역서')
    assert.ok(detailBtnAgain, 'detail 모드에서도 세부 내역서 버튼이 남아야 한다')

    await act(async () => { detailBtnAgain.click() })
    assert.ok(container.textContent.includes('세부 내역서 조회'), '다시 누르면 필터 모달이 열려야 한다')
  } finally {
    await cleanup()
  }
})
