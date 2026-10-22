// ReportPage — 위 카드 [전체][세부 내역 (거래처 선택)] 탭(9-C-2), 버튼 카드는 내용 아래.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL('./src/testSupport/jsxLoaderHook.mjs').href, import.meta.url)

import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// 내려받기 테스트용 가짜 html2pdf — 그리는 동안 pdf-export-mode가 붙어 있었는지 적어 둔다.
const html2pdfCalls = /** @type {Array<string>} */ ([])
const canvasFail = { on: false }
const fakeWorker = {
  set() { return fakeWorker },
  from() { html2pdfCalls.push(document.body.classList.contains('pdf-export-mode') ? 'from(내보내기 모드)' : 'from'); return fakeWorker },
  async save() { html2pdfCalls.push('save') },
  async outputPdf() { html2pdfCalls.push('outputPdf'); return new Blob(['%PDF'], { type: 'application/pdf' }) },
  toCanvas() { return fakeWorker },
  async get() { return { toBlob: (/** @type {(blob: Blob|null) => void} */ done) => done(canvasFail.on ? null : new Blob(['png'], { type: 'image/png' })) } },
}
mock.module('html2pdf.js', { defaultExport: () => fakeWorker })

const React = await import('react')
const { withSession } = await import('../../../testSupport/withSession.js')
const { withToast } = await import('../../../testSupport/withToast.js')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { MemoryRouter } = await import('react-router-dom')
const { default: ReportPage } = await import('./ReportPage.jsx')
const { commitClients, commitWorkData } = await import('../../../data/store/commitHelpers.ts')

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
      withSession(React.createElement(ReportPage, { onBack, viewDate: new Date(), onChangeMonth: () => {} }), { ownerKey }),
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

test('[세부 내역 (거래처 선택)] 탭 → 창 [조회] → 세부 보기·탭 파랑, 다시 누르면 창, [전체] → 요약', async () => {
  const ownerKey = 'report-page-detail-tab'
  commitClients(ownerKey, [
    { id: 'c1', companyName: '한진', fixedRouteLinked: true, fixedUnitPrice: 10000 },
  ])
  commitWorkData(ownerKey, {})

  const { container, cleanup } = await renderReport(ownerKey)
  try {
    const topCard = container.querySelector('.report-top-card')
    assert.ok(topCard)
    assert.equal(topCard.querySelector('.doc-scope-tab.active')?.textContent, '전체')
    assert.equal([...container.querySelectorAll('button')].some((el) => el.textContent === '세부 내역서'), false, '옛 버튼 없음')

    await act(async () => { buttonByText(topCard, '세부 내역 (거래처 선택)').click() })
    assert.ok(container.textContent.includes('세부 내역서 조회'))
    await act(async () => { buttonByText(container, '조회').click() })
    assert.ok(container.textContent.includes('세부 운송료 정산'))
    assert.equal(topCard.querySelector('.doc-scope-tab.active')?.textContent, '세부 내역 (거래처 선택)')

    await act(async () => { buttonByText(topCard, '세부 내역 (거래처 선택)').click() })
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
  commitWorkData(ownerKey, {})
  const { container, cleanup } = await renderReport(ownerKey)
  try {
    const topCard = /** @type {Element} */ (container.querySelector('.report-top-card'))
    await act(async () => { buttonByText(topCard, '세부 내역 (거래처 선택)').click() })
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
  commitWorkData(ownerKey, {})
  let backCount = 0
  const { container, cleanup } = await renderReport(ownerKey, () => { backCount += 1 })
  try {
    const topCard = /** @type {Element} */ (container.querySelector('.report-top-card'))
    await act(async () => { buttonByText(topCard, '세부 내역 (거래처 선택)').click() })
    await act(async () => { buttonByText(container, '조회').click() })
    const back = container.querySelector('button[title="뒤로가기"]')
    assert.ok(back instanceof window.HTMLButtonElement)
    await act(async () => { back.click() })
    assert.equal(backCount, 1)
  } finally {
    await cleanup()
  }
})

// 로드맵 99-B — 내려받기 코드를 공용으로 옮기기 전 동작(알림·파일 이름·내보내기 모드 떼기)을 적어 둔다.
/** @param {string} ownerKey */
async function renderForDownload(ownerKey) {
  commitWorkData(ownerKey, {})
  html2pdfCalls.length = 0
  const toasts = /** @type {Array<string>} */ ([])
  const links = /** @type {Array<string>} */ ([])
  const clickSpy = mock.method(window.HTMLAnchorElement.prototype, 'click', function recordLink() { links.push(this.download) })
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  URL.createObjectURL = () => 'blob:fake'
  URL.revokeObjectURL = () => {}
  const quiet = mock.method(console, 'error', () => {})
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(withToast(React.createElement(
      MemoryRouter,
      { initialEntries: ['/app/report'] },
      withSession(React.createElement(ReportPage, { viewDate: new Date(2026, 9, 1), onChangeMonth: () => {} }), { ownerKey }),
    ), (/** @type {string} */ m) => { toasts.push(m) }))
  })
  /** @param {string} label */
  async function saveAs(label) {
    await act(async () => { buttonByText(container, label).click() })
    await act(async () => { buttonByText(container, '저장').click() })
    // 성공·실패 모두 알림으로 끝나므로, 알림이 뜰 때까지 짧게 여러 번 기다린다(느린 CI에서도 끝까지 기다림).
    for (let i = 0; i < 100 && toasts.length === 0; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- 폴링 대기라 순차 await가 맞다.
      await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 20) }) })
    }
    assert.ok(toasts.length > 0, '알림이 안 뜸')
  }
  return {
    container, toasts, links, saveAs,
    async cleanup() {
      await act(async () => { root.unmount() })
      container.remove()
      clickSpy.mock.restore()
      quiet.mock.restore()
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
      canvasFail.on = false
    },
  }
}

test('이미지 저장 → 확인 창 [저장] → 파일 이름으로 내려받기, 성공 알림, 내보내기 모드 떨어짐', async () => {
  const view = await renderForDownload('report-download-image')
  try {
    await view.saveAs('이미지 저장')
    assert.deepEqual(view.links, ['2026년_10월_운송비내역서.png'])
    assert.deepEqual(view.toasts, ['이미지를 저장했습니다.'])
    assert.ok(html2pdfCalls.includes('from(내보내기 모드)'), '그리는 동안 내보내기 모드')
    assert.equal(document.body.classList.contains('pdf-export-mode'), false)
  } finally {
    await view.cleanup()
  }
})

test('PDF 저장 → 성공 알림, 내보내기 모드 떨어짐', async () => {
  const view = await renderForDownload('report-download-pdf')
  try {
    await view.saveAs('PDF 다운로드')
    assert.deepEqual(view.toasts, ['PDF를 저장했습니다.'])
    assert.ok(html2pdfCalls.includes('from(내보내기 모드)'), '그리는 동안 내보내기 모드')
    assert.equal(document.body.classList.contains('pdf-export-mode'), false)
  } finally {
    await view.cleanup()
  }
})

test('이미지 그리기 실패 → 실패 알림, 내려받기 없음, 내보내기 모드 떨어짐', async () => {
  const view = await renderForDownload('report-download-fail')
  canvasFail.on = true
  try {
    await view.saveAs('이미지 저장')
    assert.deepEqual(view.toasts, ['이미지 저장에 실패했습니다.'])
    assert.deepEqual(view.links, [])
    assert.equal(document.body.classList.contains('pdf-export-mode'), false)
  } finally {
    await view.cleanup()
  }
})

test('PDF 저장도 파일을 만들어 링크로 내려받는다(파일 이름 .pdf)', async () => {
  const view = await renderForDownload('report-download-pdf-link')
  try {
    await view.saveAs('PDF 다운로드')
    assert.deepEqual(view.links, ['2026년_10월_운송비내역서.pdf'])
    assert.ok(html2pdfCalls.includes('outputPdf'), '파일로 만들기')
    assert.equal(html2pdfCalls.includes('save'), false, 'html2pdf 자체 저장은 안 씀')
  } finally {
    await view.cleanup()
  }
})
