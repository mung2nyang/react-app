// Step 4 도메인 폴더 이동: 순수 계산은 domain/invoices.js로 옮겼다. 이 파일은 localStorage
// I/O(loadInvoices/saveInvoices)만 남기고, 기존 임포트 경로('../lib/invoices.js')를 유지하는
// 배럴로 domain/invoices.js를 재수출한다.
import { readJsonKey } from '../store/persist.js'
import { commitInvoices } from '../store/app-store.js'

export function loadInvoices(ownerKey = 'guest') {
  const parsed = readJsonKey('invoices', ownerKey, [])
  return Array.isArray(parsed) ? parsed : []
}

export function saveInvoices(ownerKey, items) {
  commitInvoices(ownerKey, items)
}

export * from '../domain/invoices.js'
