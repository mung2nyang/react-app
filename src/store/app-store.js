// @ts-check
// Step 1~4 스토어 껍데기 + Step 0-4 감사 보완(1차/2차, 사용자 지시).
// persist 도메인 반영은 applyDomainToState. 서브 일지는 workLogs[ownerKey][차량번호]
// 와 storageKeyForLog. initializeOwnerFromPersist는 owner-state.js.

import { writeAllOrNothing } from './atomicPersist.js'
import { allEntriesCloudMemoryOnly, buildBatchWrites } from './batchWrites.js'
import { scheduleCloudSync } from '../lib/syncQueue.js'

/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */
/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */
/** @typedef {import('../domain/financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('../domain/expenseTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {import('../domain/expenseTypes.js').DriverExpenseItem} DriverExpenseItem */
/** @typedef {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */
/** @typedef {import('../lib/outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {import('../lib/hydrateMergeTypes.js').LocalProfile} ProfileLike */

/**
 * @typedef {'idle'|'hydrating'|'ready'|'failed'} HydrationStatus
 * idle: 부트 전/게스트. hydrating: Supabase 조회 중. ready: 원격 쓰기 가능.
 * failed: 로컬 편집은 가능, retry 전 원격 쓰기는 금지.
 */

/**
 * @typedef {Object} HydrationState
 * @property {HydrationStatus} status
 * @property {string|null} userId
 * @property {string|null} ownerKey
 * @property {number} epoch hydrate 세대. 끝난 흐름이 다른 세대의 스위치를 덮지 않게 한다.
 */

/**
 * @typedef {Object} AppStoreState
 * @property {HydrationState} hydration
 * @property {Record<string, Record<string, Record<string, DayRecordLike>>>} workLogs ownerKey -> logId -> 날짜별 기록
 * @property {Record<string, Array<CarLike>>} cars
 * @property {Record<string, Array<ClientLike>>} clients
 * @property {Record<string, FinanceSettings>} settings
 * @property {Record<string, Array<ExpenseItem>>} expenses
 * @property {Record<string, Array<DriverExpenseItem>>} driverExpenses 서브 차량 비용(메모리 전용, hydrate replace)
 * @property {Record<string, Array<InvoiceLike>>} invoices
 * @property {Record<string, Array<DriverRecord>>} drivers
 * @property {Record<string, ProfileLike>} profile
 * @property {Record<string, Array<string>>} dismissedNotifications
 * @property {Record<string, import('../domain/workDataTombstones.js').WorkDataTombstones>} workDataDeletedDates
 */

/** @type {AppStoreState} */
const state = {
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

/** @type {Set<(state: AppStoreState) => void>} */
const listeners = new Set()

function notify() {
  listeners.forEach((listener) => listener(state))
}

/**
 * @param {(state: AppStoreState) => void} listener
 * @returns {() => void}
 */
export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** @returns {AppStoreState} */
export function getState() {
  return state
}

/**
 * @typedef {Record<string, DayRecordLike>|FinanceSettings|ProfileLike|
 *   import('../domain/workDataTombstones.js').WorkDataTombstones|Array<CarLike>|
 *   Array<ClientLike>|Array<DriverRecord>|Array<ExpenseItem>|Array<DriverExpenseItem>|
 *   Array<InvoiceLike>|Array<string>} DomainValue
 */

/**
 * @param {import('./persist.js').PersistDomain} domain
 * @param {string} ownerKey
 * @param {DomainValue} value
 */
function applyDomainToState(domain, ownerKey, value) {
  if (domain === 'workData') {
    const workData = /** @type {Record<string, DayRecordLike>} */ (value)
    const prev = state.workLogs[ownerKey] || {}
    state.workLogs = { ...state.workLogs, [ownerKey]: { ...prev, main: workData } }
    return
  }
  const slice = /** @type {Exclude<import('./persist.js').PersistDomain, 'workData'>} */ (domain)
  const stateAsRecord = /** @type {Record<Exclude<import('./persist.js').PersistDomain, 'workData'>, Record<string, DomainValue>>} */ (state)
  stateAsRecord[slice] = { ...stateAsRecord[slice], [ownerKey]: value }
}

/**
 * @typedef {Object} BatchEntry
 * @property {import('./persist.js').PersistDomain} domain
 * @property {string} ownerKey
 * @property {DomainValue} value
 */

/**
 * @typedef {Object} WorkLogsMerge
 * @property {string} ownerKey
 * @property {Record<string, Record<string, DayRecordLike>>} extra
 */

/**
 * @typedef {Object} WorkLogsReplace
 * @property {string} ownerKey
 * @property {Record<string, Record<string, DayRecordLike>>} next
 */

/**
 * @typedef {Object} DriverExpensesReplace
 * @property {string} ownerKey
 * @property {Array<DriverExpenseItem>} next
 */

/**
 * persist 성공 후에만 state/notify. extraWrites는 서브 로그 키처럼 persist 도메인 밖
 * 키를 같은 all-or-nothing에 넣는다.
 * @param {Array<BatchEntry>} entries
 * @param {{ persist?: boolean, syncToCloud?: boolean, extraWrites?: Array<import('./atomicPersist.js').KeyedWrite>, mergeWorkLogs?: WorkLogsMerge, replaceWorkLogs?: WorkLogsReplace, replaceDriverExpenses?: DriverExpensesReplace }} [options]
 * @returns {Array<DomainValue>}
 */
export function commitBatch(entries, options = {}) {
  const { persist = true, syncToCloud = true, extraWrites = [], mergeWorkLogs, replaceWorkLogs, replaceDriverExpenses } = options
  // 슬라이스 E: 로그인 세션이면 업무 도메인은 localStorage·dirty에 안 쓴다(Store 메모리만).
  const cloudOwnerKey = state.hydration.userId ? state.hydration.ownerKey : null
  const memoryOnly = allEntriesCloudMemoryOnly(entries, cloudOwnerKey)
  const writes = [...buildBatchWrites(entries, { persist, syncToCloud, cloudOwnerKey })]
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
  if (syncToCloud && entries.length && !memoryOnly) scheduleCloudSync()
  return entries.map((entry) => entry.value)
}

/**
 * @param {Partial<HydrationState>} patch
 */
export function setHydration(patch) {
  state.hydration = { ...state.hydration, ...patch }
  notify()
}
