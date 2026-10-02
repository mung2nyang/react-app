// @ts-check
import { hasOnlyKeys, isFiniteNumber, isPlainObject, isStringOrFiniteNumber } from './persistDomainRecords.js'
import { INVOICE_FLOWS, INVOICE_STATUSES, PARTY_TYPES, isAllowedEnum } from './persistDomainEnums.js'

/** @typedef {import('../lib/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
/** @typedef {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */

const INVOICE_KEYS = [
  'id', 'flow', 'monthKey', 'status', 'supabaseId', 'supplyAmount', 'taxAmount', 'totalAmount',
  'carNumber', 'vehicleNumbers', 'vehicleLabel', 'clientName', 'clientBizNumber',
  'clientRepresentative', 'clientAddress', 'clientBizType', 'clientBizItem', 'clientEmail',
  'issueDate', 'itemName', 'remark', 'updatedAt', 'issuedAt', 'partyKey', 'partyType', 'logId',
  'count', 'supplierBiz', 'supplierKey',
  // 옛 기사 매입 계산서 칸(2026-10-02 삭제) — 옛 저장분 읽기용으로만 받아 줌.
  'grossAmount', 'commissionAmount', 'insuranceAmount', 'netAmount',
]
const SUPPLIER_BIZ_KEYS = ['sameAsOwner', 'name', 'bizNumber', 'representative', 'address', 'bizType', 'bizItem', 'email']

/** @param {JsonValue} value */
function isSupplierBiz(value) {
  if (!isPlainObject(value) || !hasOnlyKeys(value, SUPPLIER_BIZ_KEYS)) return false
  if ('sameAsOwner' in value && typeof value.sameAsOwner !== 'boolean') return false
  for (const key of ['name', 'bizNumber', 'representative', 'address', 'bizType', 'bizItem', 'email']) {
    if (key in value && typeof value[key] !== 'string') return false
  }
  return true
}

/** @param {JsonValue} value @returns {value is InvoiceLike} */
export function isPersistedInvoice(value) {
  if (!isPlainObject(value) || !hasOnlyKeys(value, INVOICE_KEYS) || typeof value.id !== 'string') return false
  if ('supabaseId' in value && !isStringOrFiniteNumber(value.supabaseId)) return false
  if ('flow' in value && !isAllowedEnum(value.flow, INVOICE_FLOWS)) return false
  if ('status' in value && !isAllowedEnum(value.status, INVOICE_STATUSES)) return false
  if ('partyType' in value && !isAllowedEnum(value.partyType, PARTY_TYPES)) return false
  for (const text of [
    'monthKey', 'carNumber', 'vehicleLabel', 'clientName', 'clientBizNumber',
    'clientRepresentative', 'clientAddress', 'clientBizType', 'clientBizItem', 'clientEmail',
    'issueDate', 'itemName', 'remark', 'updatedAt', 'issuedAt', 'partyKey', 'logId', 'supplierKey',
  ]) {
    if (text in value && typeof value[text] !== 'string') return false
  }
  for (const num of ['supplyAmount', 'taxAmount', 'totalAmount', 'count', 'grossAmount', 'commissionAmount', 'insuranceAmount', 'netAmount']) {
    if (num in value && !isFiniteNumber(value[num])) return false
  }
  if ('vehicleNumbers' in value && (!Array.isArray(value.vehicleNumbers) || !value.vehicleNumbers.every((item) => typeof item === 'string'))) return false
  if ('supplierBiz' in value && !isSupplierBiz(value.supplierBiz)) return false
  return true
}
