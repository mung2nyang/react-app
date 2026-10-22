// 계산서 저장(saveInvoices) — 계산 규칙은 domain/invoices.ts.
import { commitInvoices } from '../store/commitHelpers.ts'
import { getState } from '../store/app-store.ts'
import {
  assertSessionStillCurrent,
  blockedReasonForOwnerDataWrite,
  captureSession,
  getCloudOwnerKey,
  getCloudUserId,
} from '../cloud/cloudSession.ts'
import { syncTaxInvoices } from './syncTaxInvoicesTable.ts'
import type { InvoiceLike } from '../../domain/financeTaxInvoiceEntries.ts'

export async function saveInvoices(ownerKey: string, items: InvoiceLike[]) {
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
  const next = await syncTaxInvoices((userId) as string, ownerKey, cars, clients, items)
  assertSessionStillCurrent(captured)
  commitInvoices(ownerKey, next || items)
}
