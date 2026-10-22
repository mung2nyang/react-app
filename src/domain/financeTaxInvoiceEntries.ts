// 세금계산서 "레코드" 조립(라벨, id, 당사자 정보, 저장된 발급 상태와의 병합)만 담는다 —
// 원천 그룹 계산 자체는 financeTaxInvoiceGroups.ts. 계산서 종류는 거래처 매출뿐.
import { getTaxInvoiceSourceGroups } from './financeTaxInvoiceGroups.ts'
import type { FinanceSettings, SupplierBiz, WorkDataByLogId } from './financeTypes.ts'

export type TaxInvoiceGroup = {
  partyKey?: string
  clientName?: string
  partyType?: string
  carNumber?: string
  count?: number
  supplyAmount?: number
  taxAmount?: number
  totalAmount?: number
  supplierBiz?: SupplierBiz
  vehicleLabel?: string
  vehicleNumbers?: Array<string>
}

/** 저장된 계산서 발급 상태(data/sync/syncTaxInvoicesTable.ts가 다루는 값) */
export type TaxInvoiceRecord = {
  id?: string
  flow?: string
  monthKey?: string
  status?: string
  partyKey?: string
}

/**
 * app-store.js의 invoices 슬라이스가 실제로 담는 값.
 * domain/taxInvoices.ts(mergeTaxInvoiceRecords/applyInsertedTaxInvoiceId)와
 * domain/invoices.ts(persistInvoiceRecord)가 실제로 읽고 쓰는 필드만 얹은
 * TaxInvoiceRecord의 상위집합이다 — id는 두 함수 모두 키로 쓰므로 필수.
 */
export type InvoiceLike = TaxInvoiceRecord & { id: string, supabaseId?: string | number, supplyAmount?: number,
  taxAmount?: number, totalAmount?: number, count?: number, carNumber?: string, logId?: string,
  vehicleNumbers?: Array<string>, vehicleLabel?: string, clientName?: string, clientBizNumber?: string,
  clientRepresentative?: string, clientAddress?: string, clientBizType?: string, clientBizItem?: string,
  clientEmail?: string, issueDate?: string, itemName?: string, remark?: string, updatedAt?: string,
  issuedAt?: string, partyKey?: string, partyType?: string, supplierKey?: string,
  supplierBiz?: SupplierBiz }

/** 매출 계산서 이름표(라벨·당사자 제목·품목·완료 이름). */
export function getTaxInvoiceFlowMeta() {
  return { label: '매출 발행', partyHeading: '공급받는 자', itemName: '화물운송료', completeLabel: '발급 완료' }
}

export function getTaxInvoiceRecordId(monthKey: string, partyKey?: string, flow = 'sales') {
  return `${flow}|${monthKey}|${partyKey}`
}

export function getTaxInvoicePartyInfo(group: TaxInvoiceGroup, settings: FinanceSettings = {}) {
  // .find(...)의 결과(ClientLike|undefined)에 optional chaining만 쓴다 — `|| {}`로
  // 빈 객체 리터럴 타입과 합쳐지는 순간 실제 필드에 접근할 수 없게 되는(TS2339)
  // 함정을 피한다.
  const client = (settings.clients || []).find((item) => item.companyName === group.clientName)
  return {
    clientBizNumber: client?.bizNumber || '',
    clientRepresentative: client?.taxRepresentative || client?.managerName || '',
    clientAddress: client?.taxAddress || '',
    clientBizType: client?.taxBizType || '',
    clientBizItem: client?.taxBizItem || '',
    clientEmail: client?.taxEmail || '',
  }
}

export function buildTaxInvoiceEntry(group: TaxInvoiceGroup, monthKey: string, flow: 'sales' = 'sales', records: Array<TaxInvoiceRecord> = [], settings: FinanceSettings = {}) {
  const id = getTaxInvoiceRecordId(monthKey, group.partyKey, flow)
  const saved = (records || []).find((item) => item.id === id) || {}
  const meta = getTaxInvoiceFlowMeta()
  return {
    ...getTaxInvoicePartyInfo(group, settings),
    itemName: meta.itemName,
    remark: `${parseInt(monthKey.slice(5, 7), 10)}월 ${meta.itemName}`,
    ...saved,
    ...group,
    id,
    flow,
    logId: group.carNumber || 'fleet',
    monthKey,
    status: saved.status || 'draft',
  }
}

export function getTaxInvoiceSupplierBiz(item?: { flow?: string, supplierBiz?: SupplierBiz }, settings: FinanceSettings = {}) {
  if (item?.flow === 'sales' && item.supplierBiz) return item.supplierBiz
  return {
    name: settings.bizName || '',
    bizNumber: settings.bizNumber || '',
    representative: settings.bizRepresentative || settings.userName || '',
    address: settings.bizAddress || '',
    bizType: settings.bizType || '',
    bizItem: settings.bizItem || '',
    email: settings.bizEmail || '',
  }
}

/** @param logKey 넘기면 그 차량 것만 — 저장된 발급 완료분은 partyKey(거래처__차량)로 거름 */
export function listTaxInvoiceEntries(monthKey: string, flow: 'sales', settings: FinanceSettings, workDataByLogId: WorkDataByLogId, records: Array<TaxInvoiceRecord> = [], logKey?: string) {
  const sourceEntries = getTaxInvoiceSourceGroups(monthKey, flow, settings, workDataByLogId, logKey)
    .map((group) => buildTaxInvoiceEntry(group, monthKey, flow, records, settings))
  const storedIssued = (records || []).filter((item) => item.flow === flow && item.monthKey === monthKey && item.status === 'issued'
    && (!logKey || String(item.partyKey || '').endsWith(`__${logKey}`)))
  const issuedById = new Map(storedIssued.map((item) => [item.id, item]))
  sourceEntries.forEach((item) => {
    if (item.status === 'issued') issuedById.set(item.id, item)
  })
  const issuedEntries = [...issuedById.values()]
  const draftEntries = sourceEntries.filter((item) => item.status !== 'issued')
  return { sourceEntries, draftEntries, issuedEntries }
}
