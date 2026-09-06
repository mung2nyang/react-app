// @ts-check
// Step 4 도메인 폴더 이동: invoices.js의 순수 계산부. localStorage I/O(loadInvoices/
// saveInvoices)는 lib/invoices.js에 남아 이 파일을 재수출한다.
import {
  getTaxInvoiceFlowMeta,
  getTaxInvoiceRecordId,
  getTaxInvoiceSupplierBiz,
  listTaxInvoiceEntries,
} from './finance.js'

/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('./financeTypes.js').WorkDataByLogId} WorkDataByLogId */
/** @typedef {import('./financeTaxInvoiceEntries.js').TaxInvoiceRecord} TaxInvoiceRecord */

/**
 * 세금계산서 레코드(최소 식별 필드 + 확장 필드).
 * @typedef {{ id: string, supabaseId?: string|number } & Record<string, unknown>} InvoiceRecordLike
 */

/**
 * @returns {string}
 */
export function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * @param {Array<InvoiceRecordLike>|null|undefined} records
 * @param {InvoiceRecordLike} item
 * @returns {Array<InvoiceRecordLike>}
 */
export function persistInvoiceRecord(records, item) {
  const list = [...(records || [])]
  const index = list.findIndex((record) => record.id === item.id)
  if (index >= 0) {
    list[index] = { ...list[index], ...item, supabaseId: item.supabaseId || list[index].supabaseId }
  } else {
    list.push(item)
  }
  return list
}

/**
 * @param {string} monthKey
 * @returns {string}
 */
export function lastDayOfMonth(monthKey) {
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  return `${monthKey}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
}

/**
 * @param {string} monthKey
 * @param {'sales'|'purchase'|'commission'} flow
 * @param {FinanceSettings} settings
 * @param {WorkDataByLogId} workDataByLogId
 * @param {Array<TaxInvoiceRecord>} [records]
 * @returns {ReturnType<typeof listTaxInvoiceEntries>}
 */
export function listMonthInvoices(monthKey, flow, settings, workDataByLogId, records) {
  return listTaxInvoiceEntries(monthKey, flow, settings, workDataByLogId, records)
}

/**
 * @param {{ flow?: string, supplierBiz?: import('./financeTypes.js').SupplierBiz, clientBizNumber?: string }} item
 * @param {FinanceSettings} [settings]
 * @returns {{ ok: boolean, error?: string, needDraft?: boolean }}
 */
export function invoiceCanIssue(item, settings) {
  const supplierBiz = getTaxInvoiceSupplierBiz(item, settings)
  if (!supplierBiz.name || !supplierBiz.bizNumber || !supplierBiz.representative) {
    return {
      ok: false,
      error: item.flow === 'sales' && item.supplierBiz && !item.supplierBiz.sameAsOwner
        ? '먼저 차량 관리에서 이 차량의 사업자 정보를 입력해 주세요.'
        : '먼저 개인정보에서 공급자 사업자 정보를 입력해 주세요.',
    }
  }
  if (!item.clientBizNumber) {
    return { ok: false, needDraft: true, error: '사업자등록번호란이 입력이 안 되어 있어요. 먼저 입력해 주세요.' }
  }
  return { ok: true }
}

export { getTaxInvoiceFlowMeta, getTaxInvoiceRecordId }
