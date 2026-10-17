// @ts-check
import * as v from 'valibot'
import { isPlainObject } from './persistDomainRecords.js'
import { INVOICE_FLOWS, INVOICE_STATUSES, PARTY_TYPES } from './persistDomainEnums.js'

/** @typedef {import('../lib/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
/** @typedef {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */

// 세금계산서의 칸 → 모양(Valibot). 목록 밖 칸·값이 비어 있는 칸은 거부.
const opt = v.exactOptional
const str = v.string()
const num = v.pipe(v.number(), v.finite())
/** Valibot은 배열도 객체로 받고 검사 뒤엔 새 객체를 넘기므로, 객체 검사 앞에서 배열을 먼저 거른다. @template {v.GenericSchema} T @param {T} schema */
const plain = (schema) => v.pipe(v.custom((input) => isPlainObject(/** @type {JsonValue} */ (input))), schema)

// 공급자 사업자 정보는 칸이 모두 선택이다.
const SUPPLIER_BIZ = plain(v.strictObject({
  sameAsOwner: opt(v.boolean()), name: opt(str), bizNumber: opt(str), representative: opt(str),
  address: opt(str), bizType: opt(str), bizItem: opt(str), email: opt(str),
}))

const INVOICE = plain(v.strictObject({
  id: str,
  supabaseId: opt(v.union([str, num])),
  flow: opt(v.picklist(INVOICE_FLOWS)), status: opt(v.picklist(INVOICE_STATUSES)), partyType: opt(v.picklist(PARTY_TYPES)),
  monthKey: opt(str), carNumber: opt(str), vehicleLabel: opt(str), clientName: opt(str), clientBizNumber: opt(str),
  clientRepresentative: opt(str), clientAddress: opt(str), clientBizType: opt(str), clientBizItem: opt(str), clientEmail: opt(str),
  issueDate: opt(str), itemName: opt(str), remark: opt(str), updatedAt: opt(str), issuedAt: opt(str),
  partyKey: opt(str), logId: opt(str), supplierKey: opt(str),
  supplyAmount: opt(num), taxAmount: opt(num), totalAmount: opt(num), count: opt(num),
  vehicleNumbers: opt(v.array(str)),
  supplierBiz: opt(SUPPLIER_BIZ),
  // 옛 기사 매입 계산서 칸(2026-10-02 삭제) — 옛 저장분 읽기용으로만 받아 줌.
  grossAmount: opt(num), commissionAmount: opt(num), insuranceAmount: opt(num), netAmount: opt(num),
}))

/** @param {JsonValue} value @returns {value is InvoiceLike} */
export function isPersistedInvoice(value) {
  return v.is(INVOICE, value)
}
