// @ts-check
// 계산서 저장(saveInvoices) — 계산 규칙은 domain/invoices.js.
import { commitInvoices } from '../store/commitHelpers.js'
import { getState } from '../store/app-store.js'
import {
  assertSessionStillCurrent,
  blockedReasonForOwnerDataWrite,
  captureSession,
  getCloudOwnerKey,
  getCloudUserId,
} from '../cloud/cloudSession.js'
import { syncTaxInvoices } from './syncTaxInvoicesTable.js'

/**
 * @param {string} ownerKey
 * @param {import('../../domain/financeTaxInvoiceEntries.ts').InvoiceLike[]} items
 */
export async function saveInvoices(ownerKey, items) {
  if (getCloudOwnerKey() !== ownerKey) {
    commitInvoices(ownerKey, items)
    return
  }
  const userId = getCloudUserId()
  const blocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (blocked) throw new Error(blocked)
  const cars = getState().cars[ownerKey] || []
  const clients = getState().clients[ownerKey] || []
  const captured = captureSession()
  const next = await syncTaxInvoices(/** @type {string} */ (userId), ownerKey, cars, clients, items)
  assertSessionStillCurrent(captured)
  commitInvoices(ownerKey, next || items)
}
