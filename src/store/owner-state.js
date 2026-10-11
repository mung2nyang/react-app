// @ts-check
// 앱 시작·hydrate가 거치는 두 관문. 둘 다 commitBatch 한 번으로 반영해 구독자가 반쯤 바뀐 상태를 보지 않게 한다.
// hydrate는 replaceOwnerState에 { sync: false }를 넘겨 받은 값을 서버로 되쏘지 않는다.
import { readLogWorkData } from './persist.js'
import { readPersistDomain } from './persistDomainRead.js'
import { commitBatch, getState } from './app-store.js'
import { CLOUD_MEMORY_ONLY_DOMAINS } from './batchWrites.js'
import { getCloudOwnerKey } from '../lib/cloudSession.js'
import { dedupeCarsById } from '../domain/cars.js'

/** @typedef {import('./persist.js').PersistDomain} PersistDomain */
/** @typedef {import('./app-store.js').DomainValue} DomainValue */
/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */
/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */

// workData는 readLogWorkData로 따로 읽는다.
/** @type {Array<PersistDomain>} */
const SLICE_DOMAINS = ['cars', 'clients', 'settings', 'expenses', 'invoices', 'drivers', 'profile', 'dismissedNotifications', 'workDataDeletedDates']

/**
 * localStorage에 이미 저장된 값을 store에 읽어 들인다. 아무것도 새로 쓰지 않고,
 * 클라우드 동기화도 예약하지 않는다. 도메인/서브 일지 중 하나라도 읽기·스키마가
 * 실패하면 Store와 workLogs를 전혀 바꾸지 않고 notify 0회로 끝낸다.
 *
 * 로그인 세션이면 업무 도메인은 LS에서 읽지 않는다 — hydrate가 넣은 서버 정본을 옛 LS가 덮지 않게.
 * @param {string} ownerKey
 * @returns {boolean} 하나라도 못 읽었으면 false(비회원은 막기 화면)
 */
export function initializeOwnerFromPersist(ownerKey) {
  const cloud = getCloudOwnerKey() === ownerKey
  /** @type {Array<import('./app-store.js').BatchEntry>} */
  const entries = []
  for (const domain of SLICE_DOMAINS) {
    if (cloud && CLOUD_MEMORY_ONLY_DOMAINS.has(domain)) continue
    const read = readPersistDomain(domain, ownerKey)
    if (!read.ok) return false
    if (cloud && domain === 'settings') {
      const raw = read.value && typeof read.value === 'object' ? read.value : {}
      const theme = 'theme' in raw && raw.theme === 'dark' ? 'dark' : 'light'
      const existing = getState().settings[ownerKey]
      const base = existing && typeof existing === 'object' ? existing : {}
      entries.push({ domain, ownerKey, value: { ...base, theme } })
      continue
    }
    const value = domain === 'cars' && Array.isArray(read.value)
      ? dedupeCarsById(/** @type {Array<CarLike>} */ (read.value))
      : read.value
    entries.push({ domain, ownerKey, value })
  }
  if (cloud) {
    if (entries.length) commitBatch(entries, { persist: false, syncToCloud: false })
    return true
  }
  const workRead = readLogWorkData(ownerKey, 'main')
  if (!workRead.ok) return false
  entries.push({ domain: 'workData', ownerKey, value: workRead.value })
  const carsEntry = entries.find((entry) => entry.domain === 'cars')
  const cars = Array.isArray(carsEntry?.value) ? /** @type {Array<CarLike>} */ (carsEntry.value) : []
  /** @type {Record<string, Record<string, DayRecordLike>>} */
  const extra = {}
  for (const car of cars) {
    if (car?.type !== 'sub' || !car.number || car.number === 'main') continue
    const logRead = readLogWorkData(ownerKey, car.number)
    if (!logRead.ok) return false
    extra[car.number] = logRead.value
  }
  commitBatch(entries, {
    persist: false,
    syncToCloud: false,
    replaceWorkLogs: { ownerKey, next: { main: workRead.value, ...extra } },
  })
  return true
}
/** @typedef {import('../domain/financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('../domain/expenseTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {import('../domain/expenseTypes.js').DriverExpenseItem} DriverExpenseItem */
/** @typedef {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */
/** @typedef {import('../lib/outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {import('../lib/hydrateMergeTypes.js').LocalProfile} ProfileLike */

/**
 * @typedef {Object} OwnerSnapshot
 * @property {Record<string, DayRecordLike>} [workData]
 * @property {Record<string, Record<string, DayRecordLike>>} [workLogs] logId → 날짜별 기록
 * @property {Array<CarLike>} [cars]
 * @property {Array<ClientLike>} [clients]
 * @property {Array<DriverRecord>} [drivers]
 * @property {ProfileLike} [profile]
 * @property {FinanceSettings} [settings]
 * @property {Array<ExpenseItem>} [expenses]
 * @property {Array<DriverExpenseItem>} [driverExpenses] 메모리 전용 — 있으면 통째 replace
 * @property {Array<InvoiceLike>} [invoices]
 */

/**
 * owner 전체 상태를 스냅샷으로 원자적으로 교체한다. 각 필드는 있을 때만 반영 — 부분 스냅샷도
 * 안전하다. commitBatch 한 번으로 localStorage 쓰기 + state 갱신 + notify(1회)가 전부
 * 끝난다 — 중간에 구독자가 절반만 반영된 snapshot을 볼 일이 없다.
 * @param {string} ownerKey
 * @param {OwnerSnapshot} [snapshot]
 * @param {{ sync?: boolean, persist?: boolean }} [options]
 */
export function replaceOwnerState(ownerKey, snapshot = {}, options = {}) {
  const { sync = true, persist = true } = options
  /** @type {Array<import('./app-store.js').BatchEntry>} */
  const entries = []
  const workLogs = snapshot.workLogs && typeof snapshot.workLogs === 'object' ? snapshot.workLogs : null
  if (workLogs) {
    const mainData = workLogs.main && typeof workLogs.main === 'object' ? workLogs.main : {}
    entries.push({ domain: 'workData', ownerKey, value: mainData })
  } else if (snapshot.workData && typeof snapshot.workData === 'object') {
    entries.push({ domain: 'workData', ownerKey, value: snapshot.workData })
  }
  if (Array.isArray(snapshot.cars)) entries.push({ domain: 'cars', ownerKey, value: dedupeCarsById(snapshot.cars) })
  if (Array.isArray(snapshot.clients)) entries.push({ domain: 'clients', ownerKey, value: snapshot.clients })
  if (Array.isArray(snapshot.drivers)) entries.push({ domain: 'drivers', ownerKey, value: snapshot.drivers })
  if (snapshot.profile && typeof snapshot.profile === 'object') entries.push({ domain: 'profile', ownerKey, value: snapshot.profile })
  if (snapshot.settings && typeof snapshot.settings === 'object') entries.push({ domain: 'settings', ownerKey, value: snapshot.settings })
  if (Array.isArray(snapshot.expenses)) entries.push({ domain: 'expenses', ownerKey, value: snapshot.expenses })
  if (Array.isArray(snapshot.invoices)) entries.push({ domain: 'invoices', ownerKey, value: snapshot.invoices })
  /** @type {import('./app-store.js').DriverExpensesReplace|undefined} */
  const replaceDriverExpenses = Array.isArray(snapshot.driverExpenses)
    ? { ownerKey, next: snapshot.driverExpenses }
    : undefined
  if (!entries.length && !replaceDriverExpenses) return
  if (workLogs) {
    commitBatch(entries, { persist, syncToCloud: sync, replaceWorkLogs: { ownerKey, next: workLogs }, replaceDriverExpenses })
    return
  }
  commitBatch(entries, { persist, syncToCloud: sync, replaceDriverExpenses })
}
