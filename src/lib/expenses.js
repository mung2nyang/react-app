// @ts-check
// 지출 저장(saveExpenses) + domain/expenses.js 재수출 배럴. 화면 읽기는 useOwnerExpenses.
import { commitExpenses } from '../store/commitHelpers.js'
import { dedupeExpensesById } from '../domain/expenses.js'
import { planExpenseVehicleTargets } from '../domain/expenseVehicleRouting.js'
import { getState } from '../store/app-store.js'
import {
  assertSessionStillCurrent,
  blockedReasonForOwnerDataWrite,
  captureSession,
  getCloudOwnerKey,
  getCloudUserId,
} from './cloudSession.js'
import { syncFuelRecords, syncMaintenanceRecords, syncMiscExpenseRecords } from './syncExpenseRecords.js'
import { syncExpenseItemsForVehicle } from './syncExpenseItems.js'

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
  const logs = getState().workLogs[ownerKey] || {}
  const captured = captureSession()
  // 연동 기사 세션(ownerKey = 차주 id, boot.js ownerKeyFromSession): 배정 차량 칸을 항목 단위로.
  if (userId !== ownerKey) {
    const assignedCar = (getState().cars[ownerKey] || []).find((car) => car.supabaseId)
    const previous = /** @type {Array<ExpenseItem>} */ (getState().expenses[ownerKey] || [])
    if (assignedCar?.supabaseId) {
      await syncExpenseItemsForVehicle(/** @type {string} */ (userId), assignedCar.supabaseId, previous, next, logs.main || {})
    }
    assertSessionStillCurrent(captured)
    commitExpenses(ownerKey, next, { syncToCloud: false })
    return
  }
  const targets = planExpenseVehicleTargets(getState().cars[ownerKey], getState().drivers[ownerKey], next)
  const previousAll = /** @type {Array<ExpenseItem>} */ (getState().expenses[ownerKey] || [])
  const mainVehicleId = targets.find((target) => target.logId === 'main')?.vehicleId ?? null
  // 서브 칸 먼저·메인 나중 — 중간 실패 시 유실 대신 중복(불러올 때 id로 정리).
  for (const target of targets) {
    const workData = logs[target.logId] || {}
    if (target.mode === 'items') {
      // 연동 서브(5-B-2): 기사와 공용 칸이라 항목 단위, 메인 칸의 옛 항목은 옮겨 넣는다.
      const previous = previousAll.filter((item) => String(item.vehicleNumber || '').trim() === target.logId)
      await syncExpenseItemsForVehicle(/** @type {string} */ (userId), target.vehicleId, previous, target.expenses, workData, mainVehicleId)
      continue
    }
    // 미연동 서브: 지운 항목의 날짜도 다시 써야 서버에서 사라진다(마지막 항목 삭제 포함).
    const removedDates = target.logId === 'main' ? [] : previousAll
      .filter((item) => String(item.vehicleNumber || '').trim() === target.logId && item.date)
      .map((item) => item.date)
    const dateTarget = { ...target, cleanupDates: [...target.cleanupDates, ...removedDates] }
    await syncFuelRecords(/** @type {string} */ (userId), dateTarget, workData)
    await syncMaintenanceRecords(/** @type {string} */ (userId), dateTarget, workData)
    await syncMiscExpenseRecords(/** @type {string} */ (userId), dateTarget, workData)
  }
  assertSessionStillCurrent(captured)
  commitExpenses(ownerKey, next, { syncToCloud: false })
}

export * from '../domain/expenses.js'
