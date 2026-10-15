// @ts-check
/** @typedef {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */
/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */

import { requestClientTaxInfo } from '../lib/clientMutations.js'
import { getCloudUserId } from '../lib/cloudSession.js'
import { getTaxInvoiceFlowMeta } from '../lib/finance.js'
import { invoiceCanIssue, persistInvoiceRecord } from '../lib/invoices.js'

const SAVE_FAIL_TOAST = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'

// 저장 결과를 기다린 뒤 안내 — 실패를 성공으로 보여 주지 않는다.
/** @param {() => Promise<void>} save @param {string} label @returns {Promise<boolean>} */
async function saveSucceeded(save, label) {
  try {
    await save()
    return true
  } catch (error) {
    console.error(`[taxInvoiceActions] ${label} 저장 실패:`, error)
    return false
  }
}

/**
 * @param {Object} params
 * @param {string} params.ownerKey
 * @param {Array<ClientLike>} params.clients
 * @param {Array<InvoiceLike>} params.records
 * @param {InvoiceLike} params.modalItem
 * @param {(next: Array<InvoiceLike>) => Promise<void>} params.persist
 * @param {(message: string) => void} [params.showToast]
 * @returns {Promise<boolean>} true면 모달을 닫아도 됨
 */
export async function saveTaxInvoiceDraft({ ownerKey, clients, records, modalItem, persist, showToast }) {
  if (!modalItem.clientBizNumber) {
    showToast?.('사업자등록번호를 입력해 주세요.')
    return false
  }
  if (!modalItem.issueDate) {
    showToast?.('작성일자를 입력해 주세요.')
    return false
  }
  const nextItem = { ...modalItem, updatedAt: new Date().toISOString() }
  if (nextItem.partyType === 'client') {
    const taxResult = await requestClientTaxInfo({
      ownerKey,
      userId: getCloudUserId(),
      clients,
      companyName: nextItem.clientName || '',
      patch: {
        bizNumber: nextItem.clientBizNumber,
        taxRepresentative: nextItem.clientRepresentative,
        taxEmail: nextItem.clientEmail,
        taxAddress: nextItem.clientAddress,
        taxBizType: nextItem.clientBizType,
        taxBizItem: nextItem.clientBizItem,
      },
    })
    if (taxResult.failed) {
      if (taxResult.toast) showToast?.(taxResult.toast)
      return false
    }
  }
  if (!await saveSucceeded(() => persist(persistInvoiceRecord(records, nextItem)), '작성 내용')) {
    showToast?.(SAVE_FAIL_TOAST)
    return false
  }
  showToast?.('세금계산서 작성 내용을 저장했습니다.')
  return true
}

/**
 * @param {Object} params
 * @param {InvoiceLike} params.item
 * @param {'draft'|'issued'} params.status
 * @param {import('../domain/financeTypes.js').FinanceSettings} params.settings
 * @param {Array<InvoiceLike>} params.records
 * @param {(next: Array<InvoiceLike>) => Promise<void>} params.persist
 * @param {(item: InvoiceLike) => void} params.openDraft
 * @param {(message: string) => void} [params.showToast]
 * @returns {Promise<void>}
 */
export async function changeTaxInvoiceStatus({ item, status, settings, records, persist, openDraft, showToast }) {
  if (status === 'issued') {
    const check = invoiceCanIssue(item, settings)
    if (!check.ok) {
      showToast?.(check.error || '발급할 수 없습니다.')
      if (check.needDraft) openDraft(item)
      return
    }
  }
  const saved = await saveSucceeded(() => persist(persistInvoiceRecord(records, {
    ...item,
    status,
    issuedAt: status === 'issued' ? new Date().toISOString() : '',
  })), '발급 상태')
  if (!saved) {
    showToast?.(SAVE_FAIL_TOAST)
    return
  }
  showToast?.(status === 'issued' ? `${getTaxInvoiceFlowMeta().completeLabel}로 표시했습니다.` : '처리 전 상태로 되돌렸습니다.')
}
