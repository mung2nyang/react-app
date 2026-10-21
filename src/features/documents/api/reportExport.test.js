// @ts-check
// 9-D: PDF·이미지 방향 고르기 — 안 넘기면 세로(운송비 내역서 그대로), 가로를 넘기면 가로(일상점검표 법정 서식).
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

/** @type {Array<{ jsPDF?: { orientation?: string } }>} */
const seen = []
const fakeWorker = {
  /** @param {{ jsPDF?: { orientation?: string } }} opt */
  set(opt) { seen.push(opt); return fakeWorker },
  from() { return fakeWorker },
  async outputPdf() { return new Blob(['%PDF'], { type: 'application/pdf' }) },
  toCanvas() { return fakeWorker },
  async get() { return { toBlob: (/** @type {(blob: Blob) => void} */ done) => done(new Blob(['png'], { type: 'image/png' })) } },
}
mock.module('html2pdf.js', { defaultExport: () => fakeWorker })

const { buildReportExportFile, createReportImageFile, createReportPdfFile, downloadFile } = await import('./reportExport.js')

test('방향을 안 넘기면 세로, 가로를 넘기면 가로', async () => {
  const element = document.createElement('div')
  const portrait = await createReportPdfFile(element, '운송비')
  const landscape = await createReportPdfFile(element, '일상점검표', { orientation: 'landscape' })
  assert.equal(seen[0].jsPDF?.orientation, 'portrait')
  assert.equal(seen[1].jsPDF?.orientation, 'landscape')
  assert.equal(portrait.name, '운송비.pdf')
  assert.equal(landscape.name, '일상점검표.pdf')
})

test('이미지: 방향을 안 넘기면 종이 설정 없음(운송비 내역서 그대로), 가로를 넘기면 A4 가로 너비로', async () => {
  seen.length = 0
  const element = document.createElement('div')
  await createReportImageFile(element, '운송비')
  const image = await createReportImageFile(element, '일상점검표', { orientation: 'landscape' })
  assert.equal(seen[0].jsPDF, undefined)
  assert.equal(seen[1].jsPDF?.orientation, 'landscape')
  assert.equal(image.name, '일상점검표.png')
})

// 로드맵 99-B — 운송비 내역서 화면과 공유 창이 같이 쓰는 내보내기·내려받기.
test('buildReportExportFile: 그리는 동안만 내보내기 모드, 실패해도 뗀다', async () => {
  const element = document.createElement('div')
  /** @type {Array<boolean>} */
  const modeWhileDrawing = []
  const originalFrom = fakeWorker.from
  fakeWorker.from = () => { modeWhileDrawing.push(document.body.classList.contains('pdf-export-mode')); return fakeWorker }
  try {
    const pdf = await buildReportExportFile(element, 'pdf', '2026년_10월_운송비내역서')
    const image = await buildReportExportFile(element, 'image', '2026년_10월_운송비내역서')
    assert.equal(pdf.name, '2026년_10월_운송비내역서.pdf')
    assert.equal(image.name, '2026년_10월_운송비내역서.png')
    assert.deepEqual(modeWhileDrawing, [true, true])
    assert.equal(document.body.classList.contains('pdf-export-mode'), false)
    fakeWorker.from = () => { throw new Error('그리기 실패 흉내') }
    await assert.rejects(buildReportExportFile(element, 'pdf', '실패'), /그리기 실패 흉내/)
    assert.equal(document.body.classList.contains('pdf-export-mode'), false)
  } finally {
    fakeWorker.from = originalFrom
  }
})

test('downloadFile: 파일 이름으로 링크를 눌러 내려받는다', () => {
  /** @type {Array<{ download: string, href: string }>} */
  const clicked = []
  const spy = mock.method(window.HTMLAnchorElement.prototype, 'click', /** @this {HTMLAnchorElement} */ function recordLink() { clicked.push({ download: this.download, href: this.href }) })
  const originalCreate = URL.createObjectURL
  URL.createObjectURL = () => 'blob:fake'
  try {
    downloadFile(new File(['x'], '2026년_10월_운송비내역서.pdf', { type: 'application/pdf' }))
    assert.deepEqual(clicked, [{ download: '2026년_10월_운송비내역서.pdf', href: 'blob:fake' }])
    assert.equal(document.querySelector('a[download]'), null, '누른 뒤 링크는 지움')
  } finally {
    spy.mock.restore()
    URL.createObjectURL = originalCreate
  }
})
