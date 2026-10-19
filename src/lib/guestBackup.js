// @ts-check
/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
import { readLogWorkData, storageKeyForLog } from '../data/store/persist.js'
import { readPersistDomain } from '../data/store/persistDomainRead.js'
import { matchesDomainSchema } from '../data/store/persistDomainSchema.js'
import { parsePersistedWorkDataMap } from '../data/store/persistDayRecord.js'
import { isPlainObject } from '../data/store/persistDomainRecords.js'
import { replaceOwnerState } from '../data/store/owner-state.js'
import { getState } from '../data/store/app-store.js'

/** @typedef {import('../data/store/persist.js').PersistDomain} PersistDomain */
/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */

/** @type {Array<PersistDomain>} */
const SLICE_DOMAINS = [
  'cars',
  'clients',
  'settings',
  'expenses',
  'invoices',
  'drivers',
  'profile',
  'dismissedNotifications',
  'workDataDeletedDates',
]

const LAST_BACKUP_KEY = 'lastBackupAt'

/** @returns {string|null} */
export function getLastBackupAt() {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY)
  } catch {
    return null
  }
}

/** @param {string} [isoString] */
export function markBackupDone(isoString = new Date().toISOString()) {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, isoString)
  } catch (error) {
    console.error('마지막 백업 시각 저장 실패:', error)
  }
}

/**
 * 게스트 업무 데이터 전체를 내보내기용 단일 객체로 조립한다.
 * @returns {Record<string, JsonValue>}
 */
export function buildGuestBackupData() {
  const ownerKey = 'guest'
  /** @type {Record<string, JsonValue>} */
  const backup = {
    backupType: 'react_practice_backup',
    version: 1,
    createdAt: new Date().toISOString(),
  }

  for (const domain of SLICE_DOMAINS) {
    const res = readPersistDomain(domain, ownerKey)
    if (res.ok) backup[domain] = res.value
  }

  const mainRead = readLogWorkData(ownerKey, 'main')
  const mainData = mainRead.ok ? mainRead.value : {}
  backup.workData = mainData

  const cars = Array.isArray(backup.cars) ? backup.cars : []
  /** @type {Record<string, Record<string, import('../domain/dayRecordTypes.js').DayRecordLike>>} */
  const workLogs = { main: mainData }
  for (const car of cars) {
    if (car && typeof car === 'object' && !Array.isArray(car) && car.type === 'sub' && typeof car.number === 'string' && car.number && car.number !== 'main') {
      const subRead = readLogWorkData(ownerKey, car.number)
      if (subRead.ok) workLogs[car.number] = subRead.value
    }
  }
  backup.workLogs = workLogs
  return backup
}

const INVALID_FILE = '백업 파일이 손상되었거나 운행일지 백업 파일이 아닙니다.'
/** @type {Array<PersistDomain>} */
const RECORD_DOMAINS = ['cars', 'clients', 'drivers', 'expenses', 'invoices', 'settings', 'profile', 'dismissedNotifications', 'workDataDeletedDates']

/**
 * 차량별 일지 묶음(logId → 날짜별 기록)을 검사한다. 하나라도 틀리면 null.
 * @param {JsonValue|undefined} logs
 * @returns {Record<string, Record<string, DayRecordLike>>|null}
 */
function parseLogs(logs) {
  if (logs === undefined || !isPlainObject(logs)) return null
  /** @type {Record<string, Record<string, DayRecordLike>>} */
  const out = {}
  for (const [logId, map] of Object.entries(logs)) {
    const days = parsePersistedWorkDataMap(map)
    if (!days) return null
    out[logId] = days
  }
  return out
}

/**
 * 파싱된 백업 데이터의 유효성을 검증하고 게스트 스토어에 복원한다.
 * @param {JsonValue|undefined} parsed
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function applyGuestBackupData(parsed) {
  if (parsed === undefined || !isPlainObject(parsed)) return { ok: false, error: INVALID_FILE }

  const record = parsed
  const KNOWN_KEYS = [
    'cars', 'clients', 'settings', 'expenses', 'invoices',
    'drivers', 'profile', 'workData', 'workLogs', 'subWorkData',
  ]
  if (!KNOWN_KEYS.some((key) => key in record)) return { ok: false, error: INVALID_FILE }

  // 앱 켤 때 검사(owner-state.js)와 같은 규칙 — 통과 못 하면 다음 실행이 막기 화면에 갇힌다.
  for (const domain of RECORD_DOMAINS) {
    if (domain in record && !matchesDomainSchema(domain, record[domain])) return { ok: false, error: INVALID_FILE }
  }
  const workData = 'workData' in record ? parsePersistedWorkDataMap(record.workData) : undefined
  const workLogs = 'workLogs' in record ? parseLogs(record.workLogs) : undefined
  const subWorkData = 'subWorkData' in record ? parseLogs(record.subWorkData) : undefined
  if (workData === null || workLogs === null || subWorkData === null) return { ok: false, error: INVALID_FILE }

  /** @type {import('../data/store/owner-state.js').OwnerSnapshot} */
  const snapshot = {}
  if (workLogs) snapshot.workLogs = workLogs
  else if (subWorkData) snapshot.workLogs = { main: workData || {}, ...subWorkData }
  else if (workData) snapshot.workData = workData
  if (Array.isArray(record.cars)) snapshot.cars = /** @type {Array<import('../domain/financeTypes.js').CarLike>} */ (record.cars)
  if (Array.isArray(record.clients)) snapshot.clients = /** @type {Array<import('../domain/clientTypes.js').ClientLike>} */ (record.clients)
  if (Array.isArray(record.drivers)) snapshot.drivers = /** @type {Array<import('../lib/outboxTypes.js').DriverRecord>} */ (record.drivers)
  if (isPlainObject(record.profile)) snapshot.profile = /** @type {import('../lib/hydrateMergeTypes.js').LocalProfile} */ (record.profile)
  if (isPlainObject(record.settings)) snapshot.settings = /** @type {import('../domain/financeTypes.js').FinanceSettings} */ (record.settings)
  if (Array.isArray(record.expenses)) snapshot.expenses = /** @type {Array<import('../domain/expenseTypes.js').ExpenseItem>} */ (record.expenses)
  if (Array.isArray(record.invoices)) snapshot.invoices = /** @type {Array<import('../domain/financeTaxInvoiceEntries.js').InvoiceLike>} */ (record.invoices)
  if (Array.isArray(record.dismissedNotifications)) snapshot.dismissedNotifications = /** @type {Array<string>} */ (record.dismissedNotifications)
  if (isPlainObject(record.workDataDeletedDates)) snapshot.workDataDeletedDates = /** @type {import('../domain/workDataTombstones.js').WorkDataTombstones} */ (record.workDataDeletedDates)

  /** @type {Array<import('../data/store/atomicPersist.js').KeyedWrite>} */
  const extraWrites = []
  if (snapshot.workLogs) {
    // 기사 차량 일지도 메인과 같은 저장으로 기기에 쓰고, 백업에 없는 차량의 옛 일지 키는 지운다.
    const nextLogs = snapshot.workLogs
    for (const [logId, days] of Object.entries(nextLogs)) {
      if (logId !== 'main') extraWrites.push({ key: storageKeyForLog('guest', logId), value: days })
    }
    for (const logId of Object.keys(getState().workLogs.guest || {})) {
      if (logId !== 'main' && !(logId in nextLogs)) extraWrites.push({ key: storageKeyForLog('guest', logId), remove: true })
    }
  }

  try {
    replaceOwnerState('guest', snapshot, { extraWrites })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '백업을 적용하지 못했습니다.' }
  }
}
