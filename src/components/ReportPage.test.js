// ReportPage — 위 카드 [전체][세부내역(거래처선택)] 탭(9-C-2), 버튼 카드는 내용 아래.
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
const { MemoryRouter } = await import('react-router-dom')
const { default: ReportPage } = await import('./ReportPage.jsx')
const { commitClients, commitWorkData } = await import('../store/commitHelpers.js')

/**
 * @param {string} ownerKey
 * @param {() => void} [onBack]
 */
async function renderReport(ownerKey, onBack = () => {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(
      MemoryRouter,
      { initialEntries: ['/app/report'] },
      React.createElement(ReportPage, { ownerKey, onBack, viewDate: new Date(), onChangeMonth: () => {} }),
    ))
  })
  return {
    container,
    async cleanup() {
      await act(async () => { root.unmount() })
      container.remove()
    },
  }
}

/** @param {Element} root @param {string} text */
function buttonByText(root, text) {
  const found = [...root.querySelectorAll('button')].find((el) => el.textContent === text)
  assert.ok(found instanceof window.HTMLButtonElement, `${text} 버튼`)
  return found
}

test('[세부내역(거래처선택)] 탭 → 창 [조회] → 세부 보기·탭 파랑, 다시 누르면 창, [전체] → 요약', async () => {
  const ownerKey = 'report-page-detail-tab'
  commitClients(ownerKey, [
    { id: 'c1', companyName: '한진', fixedRouteLinked: true, fixedUnitPrice: 10000 },
  ], { syncToCloud: false })
  commitWorkData(ownerKey, {}, { syncToCloud: false })

  const { container, cleanup } = await renderReport(ownerKey)
  try {
    const topCard = container.querySelector('.report-top-card')
    assert.ok(topCard)
    assert.equal(topCard.querySelector('.doc-scope-tab.active')?.textContent, '전체')
    assert.equal([...container.querySelectorAll('button')].some((el) => el.textContent === '세부 내역서'), false, '옛 버튼 없음')

    await act(async () => { buttonByText(topCard, '세부내역(거래처선택)').click() })
    assert.ok(container.textContent.includes('세부 내역서 조회'))
    await act(async () => { buttonByText(container, '조회').click() })
    assert.ok(container.textContent.includes('세부 운송료 정산'))
    assert.equal(topCard.querySelector('.doc-scope-tab.active')?.textContent, '세부내역(거래처선택)')

    await act(async () => { buttonByText(topCard, '세부내역(거래처선택)').click() })
    assert.ok(container.textContent.includes('세부 내역서 조회'), '세부 보기 중 다시 누르면 창')
    await act(async () => { buttonByText(container, '취소').click() })

    await act(async () => { buttonByText(topCard, '전체').click() })
    assert.equal(container.textContent.includes('세부 운송료 정산'), false)
    assert.equal(topCard.querySelector('.doc-scope-tab.active')?.textContent, '전체')
  } finally {
    await cleanup()
  }
})

test('[세부내역] 창에서 [취소] → 요약 그대로, 버튼 3개는 내용 아래 카드', async () => {
  const ownerKey = 'report-page-detail-cancel'
  commitWorkData(ownerKey, {}, { syncToCloud: false })
  const { container, cleanup } = await renderReport(ownerKey)
  try {
    const topCard = /** @type {Element} */ (container.querySelector('.report-top-card'))
    await act(async () => { buttonByText(topCard, '세부내역(거래처선택)').click() })
    await act(async () => { buttonByText(container, '취소').click() })
    assert.equal(container.textContent.includes('세부 내역서 조회'), false)
    assert.equal(topCard.querySelector('.doc-scope-tab.active')?.textContent, '전체')

    const actionCard = container.querySelector('.doc-action-card')
    assert.ok(actionCard)
    assert.deepEqual([...actionCard.querySelectorAll('button')].map((el) => el.textContent), ['PDF 다운로드', '이미지 저장', '공유'])
    const content = /** @type {Element} */ (container.querySelector('#reportContentToExport'))
    assert.ok(content.compareDocumentPosition(actionCard) & window.Node.DOCUMENT_POSITION_FOLLOWING, '버튼 카드는 내용 아래')
    assert.equal(topCard.querySelector('.report-pdf-actions'), null, '위 카드엔 버튼 없음')
  } finally {
    await cleanup()
  }
})

test('세부 보기에서도 머리 뒤로가기는 화면 나가기', async () => {
  const ownerKey = 'report-page-back'
  commitWorkData(ownerKey, {}, { syncToCloud: false })
  let backCount = 0
  const { container, cleanup } = await renderReport(ownerKey, () => { backCount += 1 })
  try {
    const topCard = /** @type {Element} */ (container.querySelector('.report-top-card'))
    await act(async () => { buttonByText(topCard, '세부내역(거래처선택)').click() })
    await act(async () => { buttonByText(container, '조회').click() })
    const back = container.querySelector('button[title="뒤로가기"]')
    assert.ok(back instanceof window.HTMLButtonElement)
    await act(async () => { back.click() })
    assert.equal(backCount, 1)
  } finally {
    await cleanup()
  }
})
