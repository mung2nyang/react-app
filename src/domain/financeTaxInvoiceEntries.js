// @ts-check
// 재감사 2차(FAIL 지적) — finance.js를 200줄 이하로 실제로 쪼갠 조각. 세금계산서
// "레코드" 조립(흐름별 라벨, id, 당사자 정보, 저장된 발급 상태와의 병합)만 담는다 —
// 원천 그룹 계산 자체는 financeTaxInvoiceGroups.js.
// 재감사 3차(FAIL 지적 4번) — @ts-check 적용. getTaxInvoiceSourceGroups의 반환은
// 매출(거래처)/매입·수수료(기사) 두 모양이 섞여 있어(financeTaxInvoiceGroups.js
// 참고), 여기서는 그 합집합을 느슨하게(전부 optional) 적는다 — any/unknown 대신
// 실제로 읽는 필드만 나열한다.
import { getTaxInvoiceSourceGroups } from './financeTaxInvoiceGroups.js'

/** @typedef {import('./financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('./financeTypes.js').WorkDataByLogId} WorkDataByLogId */

/**
 * @typedef {Object} TaxInvoiceGroup
 * @property {string} [partyKey]
 * @property {string} [clientName]
 * @property {string} [partyType]
 * @property {string} [carNumber]
 * @property {number} [count]
 * @property {number} [supplyAmount]
 * @property {number} [taxAmount]
 * @property {number} [totalAmount]
 * @property {object} [supplierBiz]
 * @property {string} [vehicleLabel]
 * @property {Array<string>} [vehicleNumbers]
 */

/**
 * @typedef {Object} TaxInvoiceRecord 저장된 계산서 발급 상태(lib/taxInvoices.js가 다루는 값)
 * @property {string} [id]
 * @property {string} [flow]
 * @property {string} [monthKey]
 * @property {string} [status]
 */

/**
 * 재감사 10차(FAIL 지적 4번) — app-store.js의 invoices 슬라이스가 실제로 담는 값.
 * domain/taxInvoices.js(mergeTaxInvoiceRecords/applyInsertedTaxInvoiceId)와
 * domain/invoices.js(persistInvoiceRecord)가 실제로 읽고 쓰는 필드만 얹은
 * TaxInvoiceRecord의 상위집합이다 — id는 두 함수 모두 키로 쓰므로 필수.
 * @typedef {TaxInvoiceRecord & { id: string, supabaseId?: string, supplyAmount?: number,
 *   taxAmount?: number, totalAmount?: number, carNumber?: string,
 *   vehicleNumbers?: Array<string>, clientName?: string, clientBizNumber?: string }} InvoiceLike
 */

/** @param {'sales'|'purchase'|'commission'} [flow] */
export function getTaxInvoiceFlowMeta(flow = 'sales') {
  const flows = {
    sales: { label: '매출 발행', partyHeading: '공급받는 자', itemName: '화물운송료', completeLabel: '발급 완료' },
    purchase: { label: '기사 매입', partyHeading: '공급자', itemName: '화물운송 용역', completeLabel: '수취 완료' },
    commission: { label: '수수료 발행', partyHeading: '공급받는 자', itemName: '운송 중개 수수료', completeLabel: '발급 완료' },
  }
  return flows[flow] || flows.sales
}

/**
 * @param {string} monthKey
 * @param {string} [partyKey]
 * @param {string} [flow]
 */
export function getTaxInvoiceRecordId(monthKey, partyKey, flow = 'sales') {
  return `${flow}|${monthKey}|${partyKey}`
}

/**
 * @param {TaxInvoiceGroup} group
 * @param {FinanceSettings} [settings]
 */
export function getTaxInvoicePartyInfo(group, settings = {}) {
  if (group.partyType === 'client') {
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
  const car = (settings.cars || []).find((item) => item.number === group.carNumber)
  const info = car?.personalInfo || {}
  return {
    clientBizNumber: info.bizNumber || '',
    clientRepresentative: info.name || car?.driverName || '',
    clientAddress: info.address || '',
    clientBizType: info.bizType || '',
    clientBizItem: info.bizItem || '',
    clientEmail: info.email || '',
    carNumber: car?.number,
  }
}

/**
 * @param {TaxInvoiceGroup} group
 * @param {string} monthKey
 * @param {'sales'|'purchase'|'commission'} [flow]
 * @param {Array<TaxInvoiceRecord>} [records]
 * @param {FinanceSettings} [settings]
 */
export function buildTaxInvoiceEntry(group, monthKey, flow = 'sales', records = [], settings = {}) {
  const id = getTaxInvoiceRecordId(monthKey, group.partyKey, flow)
  const saved = (records || []).find((item) => item.id === id) || {}
  const meta = getTaxInvoiceFlowMeta(flow)
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

/**
 * @param {{ flow?: string, supplierBiz?: object }} [item]
 * @param {FinanceSettings} [settings]
 */
export function getTaxInvoiceSupplierBiz(item, settings = {}) {
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

/**
 * @param {string} monthKey
 * @param {'sales'|'purchase'|'commission'} flow
 * @param {FinanceSettings} settings
 * @param {WorkDataByLogId} workDataByLogId
 * @param {Array<TaxInvoiceRecord>} [records]
 */
export function listTaxInvoiceEntries(monthKey, flow, settings, workDataByLogId, records = []) {
  const sourceEntries = getTaxInvoiceSourceGroups(monthKey, flow, settings, workDataByLogId)
    .map((group) => buildTaxInvoiceEntry(group, monthKey, flow, records, settings))
  const storedIssued = (records || []).filter((item) => item.flow === flow && item.monthKey === monthKey && item.status === 'issued')
  const issuedById = new Map(storedIssued.map((item) => [item.id, item]))
  sourceEntries.forEach((item) => {
    if (item.status === 'issued') issuedById.set(item.id, item)
  })
  const issuedEntries = [...issuedById.values()]
  const draftEntries = sourceEntries.filter((item) => item.status !== 'issued')
  return { sourceEntries, draftEntries, issuedEntries }
}
