// persist 도메인 반영은 applyDomainToState. 서브 일지는 workLogs[ownerKey][차량번호]
// 와 storageKeyForLog. initializeOwnerFromPersist는 owner-state.ts.

import { writeAllOrNothing } from './atomicPersist.ts'
import { buildBatchWrites } from './batchWrites.ts'
import type { KeyedWrite } from './atomicPersist.ts'
import type { PersistDomain } from './persist.ts'
import type { DayRecordLike } from '../../domain/dayRecordTypes.ts'
import type { CarLike, FinanceSettings } from '../../domain/financeTypes.ts'
import type { ClientLike } from '../../domain/clientTypes.ts'
import type { DriverExpenseItem, ExpenseItem } from '../../domain/expenseTypes.ts'
import type { InvoiceLike } from '../../domain/financeTaxInvoiceEntries.ts'
import type { DriverRecord } from '../../domain/driverTypes.ts'
import type { LocalProfile as ProfileLike } from '../hydrate/hydrateMergeTypes.ts'
import type { WorkDataTombstones } from '../../domain/workDataTombstones.ts'

/**
 * idle: 부트 전/게스트. hydrating: Supabase 조회 중. ready: 원격 쓰기 가능.
 * failed: 로컬 편집은 가능, retry 전 원격 쓰기는 금지.
 */
export type HydrationStatus = 'idle' | 'hydrating' | 'ready' | 'failed'

export type HydrationState = {
  status: HydrationStatus
  userId: string | null
  ownerKey: string | null
  epoch: number // hydrate 세대. 끝난 흐름이 다른 세대의 스위치를 덮지 않게 한다.
}

export type AppStoreState = {
  hydration: HydrationState
  workLogs: Record<string, Record<string, Record<string, DayRecordLike>>> // ownerKey -> logId -> 날짜별 기록
  cars: Record<string, Array<CarLike>>
  clients: Record<string, Array<ClientLike>>
  settings: Record<string, FinanceSettings>
  expenses: Record<string, Array<ExpenseItem>>
  driverExpenses: Record<string, Array<DriverExpenseItem>> // 서브 차량 비용(메모리 전용, hydrate replace)
  invoices: Record<string, Array<InvoiceLike>>
  drivers: Record<string, Array<DriverRecord>>
  profile: Record<string, ProfileLike>
  dismissedNotifications: Record<string, Array<string>>
  workDataDeletedDates: Record<string, WorkDataTombstones>
}

const state: AppStoreState = {
  hydration: { status: 'idle', userId: null, ownerKey: null, epoch: 0 },
  workLogs: {},
  cars: {},
  clients: {},
  settings: {},
  expenses: {},
  driverExpenses: {},
  invoices: {},
  drivers: {},
  profile: {},
  dismissedNotifications: {},
  workDataDeletedDates: {},
}

const listeners: Set<(state: AppStoreState) => void> = new Set()

function notify() {
  listeners.forEach((listener) => listener(state))
}

export function subscribe(listener: (state: AppStoreState) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getState(): AppStoreState {
  return state
}

export type DomainValue = Record<string, DayRecordLike> | FinanceSettings | ProfileLike |
  WorkDataTombstones | Array<CarLike> |
  Array<ClientLike> | Array<DriverRecord> | Array<ExpenseItem> | Array<DriverExpenseItem> |
  Array<InvoiceLike> | Array<string>

function applyDomainToState(domain: PersistDomain, ownerKey: string, value: DomainValue) {
  if (domain === 'workData') {
    const workData = (value) as Record<string, DayRecordLike>
    const prev = state.workLogs[ownerKey] || {}
    state.workLogs = { ...state.workLogs, [ownerKey]: { ...prev, main: workData } }
    return
  }
  const slice = (domain) as Exclude<PersistDomain, 'workData'>
  const stateAsRecord = (state) as Record<Exclude<PersistDomain, 'workData'>, Record<string, DomainValue>>
  stateAsRecord[slice] = { ...stateAsRecord[slice], [ownerKey]: value }
}

export type BatchEntry = {
  domain: PersistDomain
  ownerKey: string
  value: DomainValue
}

export type WorkLogsMerge = {
  ownerKey: string
  extra: Record<string, Record<string, DayRecordLike>>
}

export type WorkLogsReplace = {
  ownerKey: string
  next: Record<string, Record<string, DayRecordLike>>
}

export type DriverExpensesReplace = {
  ownerKey: string
  next: Array<DriverExpenseItem>
}

/**
 * persist 성공 후에만 state/notify. extraWrites는 서브 로그 키처럼 persist 도메인 밖
 * 키를 같은 all-or-nothing에 넣는다.
 */
export function commitBatch(entries: Array<BatchEntry>, options: { persist?: boolean, extraWrites?: Array<KeyedWrite>, mergeWorkLogs?: WorkLogsMerge, replaceWorkLogs?: WorkLogsReplace, replaceDriverExpenses?: DriverExpensesReplace } = {}): Array<DomainValue> {
  const { persist = true, extraWrites = [], mergeWorkLogs, replaceWorkLogs, replaceDriverExpenses } = options
  // 로그인 세션이면 업무 도메인은 localStorage에 안 쓴다(Store 메모리만).
  const cloudOwnerKey = state.hydration.userId ? state.hydration.ownerKey : null
  const writes = [...buildBatchWrites(entries, { persist, cloudOwnerKey })]
  // 로그인 세션의 extraWrites(서브 일지 키 등)도 LS에 안 쓴다. 게스트만 남긴다.
  if (persist && extraWrites.length && cloudOwnerKey == null) writes.push(...extraWrites)
  if (writes.length) writeAllOrNothing(writes)

  entries.forEach(({ domain, ownerKey, value }) => {
    applyDomainToState(domain, ownerKey, value)
  })
  if (mergeWorkLogs) {
    const prev = state.workLogs[mergeWorkLogs.ownerKey] || {}
    state.workLogs = { ...state.workLogs, [mergeWorkLogs.ownerKey]: { ...prev, ...mergeWorkLogs.extra } }
  }
  if (replaceWorkLogs) {
    state.workLogs = { ...state.workLogs, [replaceWorkLogs.ownerKey]: replaceWorkLogs.next }
  }
  // driverExpenses는 PersistDomain 밖 — replace만(merge 없음). 빈 배열도 스테일 제거.
  if (replaceDriverExpenses) {
    state.driverExpenses = { ...state.driverExpenses, [replaceDriverExpenses.ownerKey]: replaceDriverExpenses.next }
  }
  notify()
  return entries.map((entry) => entry.value)
}

export function setHydration(patch: Partial<HydrationState>) {
  state.hydration = { ...state.hydration, ...patch }
  notify()
}
