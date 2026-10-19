// @ts-check
import * as v from 'valibot'
import { bool, finiteNumber, opt, plain, str, stringOrNumber } from '../../domain/schemaParts.js'
import { INVOICE_FLOWS, INVOICE_STATUSES, PARTY_TYPES } from './persistDomainEnums.js'

/** @typedef {import('../sync/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
/** @typedef {import('../../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */

// 세금계산서의 칸 → 모양(Valibot, 공용 조각은 domain/schemaParts.js). 목록 밖 칸·값이 비어 있는 칸은 거부.

// 공급자 사업자 정보는 칸이 모두 선택이다.
const SUPPLIER_BIZ = plain(v.strictObject({
  sameAsOwner: opt(bool), name: opt(str), bizNumber: opt(str), representative: opt(str),
  address: opt(str), bizType: opt(str), bizItem: opt(str), email: opt(str),
}))

const INVOICE = plain(v.strictObject({
  id: str,
  supabaseId: opt(stringOrNumber),
  flow: opt(v.picklist(INVOICE_FLOWS)), status: opt(v.picklist(INVOICE_STATUSES)), partyType: opt(v.picklist(PARTY_TYPES)),
  monthKey: opt(str), carNumber: opt(str), vehicleLabel: opt(str), clientName: opt(str), clientBizNumber: opt(str),
  clientRepresentative: opt(str), clientAddress: opt(str), clientBizType: opt(str), clientBizItem: opt(str), clientEmail: opt(str),
  issueDate: opt(str), itemName: opt(str), remark: opt(str), updatedAt: opt(str), issuedAt: opt(str),
  partyKey: opt(str), logId: opt(str), supplierKey: opt(str),
  supplyAmount: opt(finiteNumber), taxAmount: opt(finiteNumber), totalAmount: opt(finiteNumber), count: opt(finiteNumber),
  vehicleNumbers: opt(v.array(str)),
  supplierBiz: opt(SUPPLIER_BIZ),
  // 옛 기사 매입 계산서 칸(2026-10-02 삭제) — 옛 저장분 읽기용으로만 받아 줌.
  grossAmount: opt(finiteNumber), commissionAmount: opt(finiteNumber), insuranceAmount: opt(finiteNumber), netAmount: opt(finiteNumber),
}))

/** @param {JsonValue} value @returns {value is InvoiceLike} */
export function isPersistedInvoice(value) {
  return v.is(INVOICE, value)
}
