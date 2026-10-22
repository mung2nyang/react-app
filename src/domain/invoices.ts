// 계산서 순수 계산부. 저장은 data/sync/invoicesSave.js.
import {
  getTaxInvoiceFlowMeta,
  getTaxInvoiceRecordId,
  getTaxInvoiceSupplierBiz,
  listTaxInvoiceEntries,
} from './finance.ts'
import type { JsonValue } from './jsonTypes.ts'
import type { FinanceSettings, SupplierBiz, WorkDataByLogId } from './financeTypes.ts'
import type { TaxInvoiceRecord } from './financeTaxInvoiceEntries.ts'

/** 세금계산서 레코드(최소 식별 필드 + 확장 필드). */
export type InvoiceRecordLike = { id: string, supabaseId?: string | number } & Record<string, JsonValue | undefined>

export function currentMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function persistInvoiceRecord(records: Array<InvoiceRecordLike> | null | undefined, item: InvoiceRecordLike): Array<InvoiceRecordLike> {
  const list = [...(records || [])]
  const index = list.findIndex((record) => record.id === item.id)
  if (index >= 0) {
    list[index] = { ...list[index], ...item, supabaseId: item.supabaseId || list[index].supabaseId }
  } else {
    list.push(item)
  }
  return list
}

export function lastDayOfMonth(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  return `${monthKey}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
}

/** @param logKey 서류 발급 차량별(없으면 전체) */
export function listMonthInvoices(monthKey: string, flow: 'sales', settings: FinanceSettings, workDataByLogId: WorkDataByLogId, records?: Array<TaxInvoiceRecord>, logKey?: string): ReturnType<typeof listTaxInvoiceEntries> {
  return listTaxInvoiceEntries(monthKey, flow, settings, workDataByLogId, records, logKey)
}

export function invoiceCanIssue(item: { flow?: string, supplierBiz?: SupplierBiz, clientBizNumber?: string }, settings?: FinanceSettings): { ok: boolean, error?: string, needDraft?: boolean } {
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
    return { ok: false, needDraft: true, error: '사업자등록번호를 먼저 입력해 주세요.' }
  }
  return { ok: true }
}

export { getTaxInvoiceFlowMeta, getTaxInvoiceRecordId }
