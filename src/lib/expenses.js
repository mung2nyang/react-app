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
    commitExpenses(ownerKey, next)
    return
  }
  const cars = getState().cars[ownerKey]
  const drivers = getState().drivers[ownerKey]
  const targets = planExpenseVehicleTargets(cars, drivers, next)
  const previousAll = /** @type {Array<ExpenseItem>} */ (getState().expenses[ownerKey] || [])
  const previousByLog = new Map(planExpenseVehicleTargets(cars, drivers, previousAll).map((target) => [target.logId, target.expenses]))
  const mainVehicleId = targets.find((target) => target.logId === 'main')?.vehicleId ?? null
  // 서브 칸 먼저·메인 나중 — 중간 실패 시 유실 대신 중복(불러올 때 id로 정리).
  for (const target of targets) {
    const ownIds = new Set(target.expenses.map((item) => item.id))
    // 내가 알던 항목 = 저장 전 이 칸 항목 + 이번에 다른 칸으로 간 항목(이 칸에 남은 옛 줄을 지운다).
    const previous = [...(previousByLog.get(target.logId) || []), ...next.filter((item) => !ownIds.has(item.id))]
    const linked = target.mode === 'items'
    // 연동 서브(5-B-2)는 메인 칸의 옛 항목을 옮겨 넣고, 차주만 쓰는 칸은 서버에서 빠진 항목을 다시 넣는다.
    await syncExpenseItemsForVehicle(/** @type {string} */ (userId), target.vehicleId, previous, target.expenses, logs[target.logId] || {}, linked ? mainVehicleId : null, !linked)
  }
  assertSessionStillCurrent(captured)
  commitExpenses(ownerKey, next)
}

export * from '../domain/expenses.js'
