// @ts-check
// 차주 화면 읽기전용 — 서브(기사) 차량 비용 버킷 구독(PersistDomain 아님).
import { useSyncExternalStore } from 'react'
import { getState, subscribe } from './app-store.js'

/** @typedef {import('../domain/expenseTypes.js').DriverExpenseItem} DriverExpenseItem */

const EMPTY_DRIVER_EXPENSES = /** @type {Array<DriverExpenseItem>} */ ([])

/**
 * @param {string} ownerKey
 * @returns {Array<DriverExpenseItem>}
 */
export function readOwnerDriverExpenses(ownerKey) {
  return getState().driverExpenses[ownerKey] || EMPTY_DRIVER_EXPENSES
}

/**
 * @param {string} ownerKey
 * @returns {Array<DriverExpenseItem>}
 */
export function useOwnerDriverExpenses(ownerKey) {
  return useSyncExternalStore(subscribe, () => readOwnerDriverExpenses(ownerKey))
}
