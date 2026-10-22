// 차주 화면 읽기전용 — 서브(기사) 차량 비용 버킷 구독(PersistDomain 아님).
import { useSyncExternalStore } from 'react'
import { getState, subscribe } from './app-store.ts'
import type { DriverExpenseItem } from '../../domain/expenseTypes.ts'

const EMPTY_DRIVER_EXPENSES = ([]) as Array<DriverExpenseItem>

export function readOwnerDriverExpenses(ownerKey: string): Array<DriverExpenseItem> {
  return getState().driverExpenses[ownerKey] || EMPTY_DRIVER_EXPENSES
}

export function useOwnerDriverExpenses(ownerKey: string): Array<DriverExpenseItem> {
  return useSyncExternalStore(subscribe, () => readOwnerDriverExpenses(ownerKey))
}
