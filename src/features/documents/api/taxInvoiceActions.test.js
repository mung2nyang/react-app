// @ts-check
// 로드맵 74 — 세금계산서 작성 저장·발급 상태 바꾸기는 저장 결과를 기다린 뒤 안내한다.
import '../../../testSupport/stubSupabaseClient.js'
import '../../../testSupport/setupDom.js'
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

const { changeTaxInvoiceStatus, checkTaxInvoiceDraft, saveTaxInvoiceDraft } = await import('./taxInvoiceActions.js')

const SAVE_FAIL = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'

/** @type {import('../../../domain/financeTaxInvoiceEntries.ts').InvoiceLike} */
const ITEM = { id: 'inv-74', partyType: 'driver', clientName: '시험기사', clientBizNumber: '123-45-67890', issueDate: '2026-10-31', status: 'issued' }

/** @param {boolean} fail */
function persistSpy(fail) {
  /** @type {Array<Array<import('../../../domain/financeTaxInvoiceEntries.ts').InvoiceLike>>} */
  const calls = []
  /** @param {Array<import('../../../domain/financeTaxInvoiceEntries.ts').InvoiceLike>} next */
  const persist = async (next) => {
    calls.push(next)
    if (fail) throw new Error('network down')
  }
  return { calls, persist }
}

/** @returns {{ toasts: Array<string>, showToast: (message: string) => void }} */
function toastSpy() {
  /** @type {Array<string>} */
  const toasts = []
  return { toasts, showToast: (message) => { toasts.push(message) } }
}

test('74-1: 작성 저장이 실패하면 실패 안내만, 창은 닫지 않는다', async () => {
  const { persist, calls } = persistSpy(true)
  const { toasts, showToast } = toastSpy()
  const errors = mock.method(console, 'error', () => {})
  try {
    const closed = await saveTaxInvoiceDraft({ ownerKey: 'own-74', clients: [], records: [], modalItem: ITEM, persist, showToast })
    assert.equal(closed, false)
    assert.equal(calls.length, 1)
    assert.deepEqual(toasts, [SAVE_FAIL])
    assert.equal(errors.mock.callCount(), 1)
  } finally {
    errors.mock.restore()
  }
})

test('74-2: 작성 저장이 성공하면 성공 안내, 창 닫기', async () => {
  const { persist } = persistSpy(false)
  const { toasts, showToast } = toastSpy()
  const closed = await saveTaxInvoiceDraft({ ownerKey: 'own-74', clients: [], records: [], modalItem: ITEM, persist, showToast })
  assert.equal(closed, true)
  assert.deepEqual(toasts, ['세금계산서 작성 내용을 저장했습니다.'])
})

test('74-3: 발급 상태 되돌리기가 실패하면 실패 안내만', async () => {
  const { persist } = persistSpy(true)
  const { toasts, showToast } = toastSpy()
  const errors = mock.method(console, 'error', () => {})
  try {
    await changeTaxInvoiceStatus({ item: ITEM, status: 'draft', settings: {}, records: [ITEM], persist, openDraft: () => {}, showToast })
    assert.deepEqual(toasts, [SAVE_FAIL])
  } finally {
    errors.mock.restore()
  }
})

test('74-4: 발급 상태 되돌리기가 성공하면 지금 안내', async () => {
  const { persist, calls } = persistSpy(false)
  const { toasts, showToast } = toastSpy()
  await changeTaxInvoiceStatus({ item: ITEM, status: 'draft', settings: {}, records: [ITEM], persist, openDraft: () => {}, showToast })
  assert.equal(calls[0]?.[0]?.status, 'draft')
  assert.deepEqual(toasts, ['처리 전 상태로 되돌렸습니다.'])
})

test('저장 전 검사 — 사업자등록번호 → 작성일자 순서로 빈 칸 하나(로드맵 82-C)', () => {
  assert.deepEqual(checkTaxInvoiceDraft({ id: 'inv-82c', clientBizNumber: '', issueDate: '' }), { field: 'clientBizNumber', message: '사업자등록번호를 입력해 주세요.' })
  assert.deepEqual(checkTaxInvoiceDraft({ id: 'inv-82c', clientBizNumber: '123-45-67890', issueDate: '' }), { field: 'issueDate', message: '작성일자를 입력해 주세요.' })
  assert.equal(checkTaxInvoiceDraft({ id: 'inv-82c', clientBizNumber: '123-45-67890', issueDate: '2026-10-31' }), null)
})
