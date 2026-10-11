// @ts-check
/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
// 계산서 localStorage I/O + domain/invoices.js 재수출 배럴.
import { readJsonKey } from '../store/persist.js'
import { commitInvoices } from '../store/commitHelpers.js'
import { getState } from '../store/app-store.js'
import {
  assertSessionStillCurrent,
  blockedReasonForOwnerDataWrite,
  captureSession,
  getCloudOwnerKey,
  getCloudUserId,
} from './cloudSession.js'
import { syncTaxInvoices } from './syncTaxInvoicesTable.js'

/** @param {string} [ownerKey] */
export function loadInvoices(ownerKey = 'guest') {
  const parsed = readJsonKey('invoices', ownerKey, /** @type {Array<JsonValue>} */ ([]))
  return Array.isArray(parsed) ? parsed : []
}

/**
 * @param {string} ownerKey
 * @param {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike[]} items
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
  commitInvoices(ownerKey, next || items, { syncToCloud: false })
}

export * from '../domain/invoices.js'
