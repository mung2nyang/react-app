// @ts-check
// Step 4 도메인 폴더 이동: 순수 계산은 domain/expenses.js로 옮겼다. 이 파일은 localStorage/
// Supabase 쓰기(saveExpenses)만 남기고, 기존 임포트 경로('../lib/expenses.js')를 유지하는
// 배럴로 domain/expenses.js를 재수출한다.
// (loadExpenses는 화면이 useOwnerExpenses store 구독으로 바뀌며 호출부가 0이 돼 삭제했다.)
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

/** @typedef {import('../domain/expenseTypes.js').ExpenseItem} ExpenseItem */

/** @param {string} ownerKey @param {Array<ExpenseItem>} items */
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
