// @ts-check
// 9-D: PDF·이미지 방향 고르기 — 안 넘기면 세로(운송비 내역서 그대로), 가로를 넘기면 가로(일상점검표 법정 서식).
import '../testSupport/setupDom.js'
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

const { createReportImageFile, createReportPdfFile } = await import('./reportExport.js')

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
