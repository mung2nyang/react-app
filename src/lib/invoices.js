// Step 4 도메인 폴더 이동: 순수 계산은 domain/invoices.js로 옮겼다. 이 파일은 localStorage
// I/O(loadInvoices/saveInvoices)만 남기고, 기존 임포트 경로('../lib/invoices.js')를 유지하는
// 배럴로 domain/invoices.js를 재수출한다.
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

export function loadInvoices(ownerKey = 'guest') {
  const parsed = readJsonKey('invoices', ownerKey, [])
  return Array.isArray(parsed) ? parsed : []
}

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
