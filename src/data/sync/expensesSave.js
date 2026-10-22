// @ts-check
// 지출 저장(saveExpenses)과 두 화면이 같이 쓰는 입력값 저장·삭제. 화면 읽기는 useOwnerExpenses, 계산 규칙은 domain/expenses.js.
import { commitExpenses } from '../store/commitHelpers.js'
import { dedupeExpensesById } from '../../domain/expenses.js'
import { removeExpense, upsertExpense } from '../../domain/expenseDraft.js'
import { planExpenseVehicleTargets } from '../../domain/expenseVehicleRouting.js'
import { getState } from '../store/app-store.js'
import {
  assertSessionStillCurrent,
  blockedReasonForOwnerDataWrite,
  captureSession,
  getCloudOwnerKey,
  getCloudUserId,
} from '../cloud/cloudSession.js'
import { syncExpenseItemsForVehicle } from './syncExpenseItems.js'
import { saveFailMessage } from '../../shared/utils/failureMessages.js'

/** @typedef {import('../../domain/expenseTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {import('../../domain/expenseTypes.js').ExpenseDraft} ExpenseDraft */

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
  // 연동 기사 세션(ownerKey = 차주 id, appSession.js ownerKeyFromSession): 배정 차량 칸을 항목 단위로.
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

/** @param {string} ownerKey @returns {Array<ExpenseItem>} */
function latestExpenses(ownerKey) {
  return /** @type {Array<ExpenseItem>} */ (getState().expenses[ownerKey] || [])
}

/**
 * 입력값을 최신 목록에 반영해 저장. 알림 문구(검사·실패)를 돌려주고, 성공이면 null.
 * @param {string} ownerKey
 * @param {ExpenseDraft} draft
 * @param {string|null} editingId
 * @returns {Promise<string|null>}
 */
export async function saveExpenseDraft(ownerKey, draft, editingId) {
  const result = upsertExpense(latestExpenses(ownerKey), draft, editingId)
  if (result.error) return result.error
  try {
    await saveExpenses(ownerKey, result.items)
    return null
  } catch (error) {
    console.error('비용 저장 실패:', error)
    return saveFailMessage(getCloudOwnerKey() === ownerKey)
  }
}

/**
 * 최신 목록에서 빼고 저장. 실패 문구를 돌려주고, 성공이면 null.
 * @param {string} ownerKey
 * @param {string} id
 * @returns {Promise<string|null>}
 */
export async function deleteExpense(ownerKey, id) {
  try {
    await saveExpenses(ownerKey, removeExpense(latestExpenses(ownerKey), id))
    return null
  } catch (error) {
    console.error('비용 삭제 실패:', error)
    return saveFailMessage(getCloudOwnerKey() === ownerKey)
  }
}
