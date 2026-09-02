// Step 4 도메인 폴더 이동: 순수 계산은 domain/expenses.js로 옮겼다. 이 파일은 localStorage
// I/O(loadExpenses/saveExpenses)만 남기고, 기존 임포트 경로('../lib/expenses.js')를 유지하는
// 배럴로 domain/expenses.js를 재수출한다.
import { readJsonKey } from '../store/persist.js'
import { commitExpenses } from '../store/commitHelpers.js'
import { dedupeExpensesById } from '../domain/expenses.js'
import { getState } from '../store/app-store.js'
import {
  assertSessionStillCurrent,
  blockedReasonForOwnerDataWrite,
  captureSession,
  getCloudOwnerKey,
  getCloudUserId,
} from './cloudSession.js'
import { syncFuelRecords, syncMaintenanceRecords, syncMiscExpenseRecords } from './syncExpenseRecords.js'

export function loadExpenses(ownerKey = 'guest') {
  const parsed = readJsonKey('expenses', ownerKey, [])
  return Array.isArray(parsed) ? dedupeExpensesById(parsed) : []
}

export async function saveExpenses(ownerKey, items) {
  const next = dedupeExpensesById(items)
  if (getCloudOwnerKey() !== ownerKey) {
    commitExpenses(ownerKey, next)
    return
  }
  const userId = getCloudUserId()
  const blocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (blocked) throw new Error(blocked)
  const cars = getState().cars[ownerKey] || []
  const workData = (getState().workLogs[ownerKey] || {}).main || {}
  const captured = captureSession()
  await syncFuelRecords(/** @type {string} */ (userId), ownerKey, cars, next, workData)
  await syncMaintenanceRecords(/** @type {string} */ (userId), ownerKey, cars, next, workData)
  await syncMiscExpenseRecords(/** @type {string} */ (userId), ownerKey, cars, next, workData)
  assertSessionStillCurrent(captured)
  commitExpenses(ownerKey, next, { syncToCloud: false })
}

export * from '../domain/expenses.js'
