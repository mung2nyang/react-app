import {
  getTaxInvoiceFlowMeta,
  getTaxInvoiceRecordId,
  getTaxInvoiceSupplierBiz,
  listTaxInvoiceEntries,
} from './finance.js'
import { readJsonKey } from '../store/persist.js'
import { commitInvoices } from '../store/app-store.js'

export function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function loadInvoices(ownerKey = 'guest') {
  const parsed = readJsonKey('invoices', ownerKey, [])
  return Array.isArray(parsed) ? parsed : []
}

export function saveInvoices(ownerKey, items) {
  commitInvoices(ownerKey, items)
}

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

export function lastDayOfMonth(monthKey) {
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  return `${monthKey}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
}

export function listMonthInvoices(monthKey, flow, settings, workDataByLogId, records) {
  return listTaxInvoiceEntries(monthKey, flow, settings, workDataByLogId, records)
}

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
