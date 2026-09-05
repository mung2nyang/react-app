// @ts-check
import { readLogWorkData } from '../store/persist.js'
import { readPersistDomain } from '../store/persistDomainRead.js'
import { replaceOwnerState } from '../store/owner-state.js'

/** @typedef {import('../store/persist.js').PersistDomain} PersistDomain */

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
 * @returns {Record<string, unknown>}
 */
export function buildGuestBackupData() {
  const ownerKey = 'guest'
  /** @type {Record<string, unknown>} */
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
    if (car && typeof car === 'object' && car.type === 'sub' && car.number && car.number !== 'main') {
      const subRead = readLogWorkData(ownerKey, car.number)
      if (subRead.ok) workLogs[car.number] = subRead.value
    }
  }
  backup.workLogs = workLogs
  return backup
}

/**
 * 파싱된 백업 데이터의 유효성을 검증하고 게스트 스토어에 복원한다.
 * @param {unknown} parsed
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function applyGuestBackupData(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: '유효한 백업 데이터가 아닙니다.' }
  }

  const record = /** @type {Record<string, unknown>} */ (parsed)
  const KNOWN_KEYS = [
    'cars', 'clients', 'settings', 'expenses', 'invoices',
    'drivers', 'profile', 'workData', 'workLogs', 'subWorkData',
  ]
  if (!KNOWN_KEYS.some((key) => key in record)) {
    return { ok: false, error: '백업 데이터에 유효한 도메인이 없습니다.' }
  }

  // 중첩 구조 및 타입 런타임 검증 (AGENTS §6)
  const arrayDomains = ['cars', 'clients', 'drivers', 'expenses', 'invoices']
  for (const domain of arrayDomains) {
    if (domain in record) {
      const arr = record[domain]
      if (!Array.isArray(arr) || arr.some((item) => !item || typeof item !== 'object')) {
        return { ok: false, error: `${domain} 데이터 형식이 올바르지 않습니다.` }
      }
    }
  }

  if ('settings' in record) {
    if (!record.settings || typeof record.settings !== 'object' || Array.isArray(record.settings)) {
      return { ok: false, error: 'settings 형식이 올바르지 않습니다.' }
    }
  }
  if ('profile' in record) {
    if (!record.profile || typeof record.profile !== 'object' || Array.isArray(record.profile)) {
      return { ok: false, error: 'profile 형식이 올바르지 않습니다.' }
    }
  }
  if ('workData' in record) {
    if (!record.workData || typeof record.workData !== 'object' || Array.isArray(record.workData)) {
      return { ok: false, error: 'workData 형식이 올바르지 않습니다.' }
    }
    for (const day of Object.values(/** @type {Record<string, unknown>} */ (record.workData))) {
      if (!day || typeof day !== 'object' || Array.isArray(day)) {
        return { ok: false, error: '일지 데이터 항목이 올바르지 않습니다.' }
      }
    }
  }
  if ('workLogs' in record) {
    if (!record.workLogs || typeof record.workLogs !== 'object' || Array.isArray(record.workLogs)) {
      return { ok: false, error: 'workLogs 형식이 올바르지 않습니다.' }
    }
    for (const log of Object.values(/** @type {Record<string, unknown>} */ (record.workLogs))) {
      if (!log || typeof log !== 'object' || Array.isArray(log)) {
        return { ok: false, error: '차량별 일지 항목이 올바르지 않습니다.' }
      }
    }
  }
  if ('subWorkData' in record) {
    if (!record.subWorkData || typeof record.subWorkData !== 'object' || Array.isArray(record.subWorkData)) {
      return { ok: false, error: 'subWorkData 형식이 올바르지 않습니다.' }
    }
  }

  /** @type {import('../store/owner-state.js').OwnerSnapshot} */
  const snapshot = {}
  if (record.workLogs && typeof record.workLogs === 'object') {
    snapshot.workLogs = /** @type {Record<string, Record<string, import('../domain/dayRecordTypes.js').DayRecordLike>>} */ (record.workLogs)
  } else if (record.subWorkData && typeof record.subWorkData === 'object') {
    snapshot.workLogs = {
      main: (record.workData && typeof record.workData === 'object' && !Array.isArray(record.workData))
        ? /** @type {Record<string, import('../domain/dayRecordTypes.js').DayRecordLike>} */ (record.workData)
        : {},
      .../** @type {Record<string, Record<string, import('../domain/dayRecordTypes.js').DayRecordLike>>} */ (record.subWorkData),
    }
  } else if (record.workData && typeof record.workData === 'object') {
    snapshot.workData = /** @type {Record<string, import('../domain/dayRecordTypes.js').DayRecordLike>} */ (record.workData)
  }
  if (Array.isArray(record.cars)) snapshot.cars = /** @type {Array<import('../domain/financeTypes.js').CarLike>} */ (record.cars)
  if (Array.isArray(record.clients)) snapshot.clients = /** @type {Array<import('../domain/clientTypes.js').ClientLike>} */ (record.clients)
  if (Array.isArray(record.drivers)) snapshot.drivers = /** @type {Array<import('../lib/outboxTypes.js').DriverRecord>} */ (record.drivers)
  if (record.profile && typeof record.profile === 'object' && !Array.isArray(record.profile)) {
    snapshot.profile = /** @type {import('../lib/hydrateMergeTypes.js').LocalProfile} */ (record.profile)
  }
  if (record.settings && typeof record.settings === 'object' && !Array.isArray(record.settings)) {
    snapshot.settings = /** @type {import('../domain/financeTypes.js').FinanceSettings} */ (record.settings)
  }
  if (Array.isArray(record.expenses)) snapshot.expenses = /** @type {Array<import('../domain/expenseTypes.js').ExpenseItem>} */ (record.expenses)
  if (Array.isArray(record.invoices)) snapshot.invoices = /** @type {Array<import('../domain/financeTaxInvoiceEntries.js').InvoiceLike>} */ (record.invoices)

  try {
    replaceOwnerState('guest', snapshot, { sync: false })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '백업 적용 중 오류가 발생했습니다.' }
  }
}
