import type { JsonValue } from '../../domain/jsonTypes.ts'
import { readLogWorkData, storageKeyForLog } from '../store/persist.ts'
import { readPersistDomain } from '../store/persistDomainRead.ts'
import { matchesDomainSchema } from '../store/persistDomainSchema.ts'
import { parsePersistedWorkDataMap } from '../store/persistDayRecord.ts'
import { isPlainObject } from '../store/persistDomainRecords.ts'
import { replaceOwnerState } from '../store/owner-state.ts'
import { getState } from '../store/app-store.ts'
import type { PersistDomain } from '../store/persist.ts'
import type { DayRecordLike } from '../../domain/dayRecordTypes.ts'
import type { OwnerSnapshot } from '../store/owner-state.ts'
import type { CarLike, FinanceSettings } from '../../domain/financeTypes.ts'
import type { ClientLike } from '../../domain/clientTypes.ts'
import type { DriverRecord } from '../../domain/driverTypes.ts'
import type { LocalProfile } from '../hydrate/hydrateMergeTypes.ts'
import type { ExpenseItem } from '../../domain/expenseTypes.ts'
import type { InvoiceLike } from '../../domain/financeTaxInvoiceEntries.ts'
import type { WorkDataTombstones } from '../../domain/workDataTombstones.ts'
import type { KeyedWrite } from '../store/atomicPersist.ts'

const SLICE_DOMAINS: Array<PersistDomain> = [
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

export function getLastBackupAt(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY)
  } catch {
    return null
  }
}

export function markBackupDone(isoString: string = new Date().toISOString()) {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, isoString)
  } catch (error) {
    console.error('마지막 백업 시각 저장 실패:', error)
  }
}

/** 게스트 업무 데이터 전체를 내보내기용 단일 객체로 조립한다. */
export function buildGuestBackupData(): Record<string, JsonValue> {
  const ownerKey = 'guest'
  const backup: Record<string, JsonValue> = {
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
  const workLogs: Record<string, Record<string, DayRecordLike>> = { main: mainData }
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
const RECORD_DOMAINS: Array<PersistDomain> = ['cars', 'clients', 'drivers', 'expenses', 'invoices', 'settings', 'profile', 'dismissedNotifications', 'workDataDeletedDates']

/** 차량별 일지 묶음(logId → 날짜별 기록)을 검사한다. 하나라도 틀리면 null. */
function parseLogs(logs: JsonValue | undefined): Record<string, Record<string, DayRecordLike>> | null {
  if (logs === undefined || !isPlainObject(logs)) return null
  const out: Record<string, Record<string, DayRecordLike>> = {}
  for (const [logId, map] of Object.entries(logs)) {
    const days = parsePersistedWorkDataMap(map)
    if (!days) return null
    out[logId] = days
  }
  return out
}

/** 파싱된 백업 데이터의 유효성을 검증하고 게스트 스토어에 복원한다. */
export function applyGuestBackupData(parsed: JsonValue | undefined): { ok: true } | { ok: false, error: string } {
  if (parsed === undefined || !isPlainObject(parsed)) return { ok: false, error: INVALID_FILE }

  const record = parsed
  const KNOWN_KEYS = [
    'cars', 'clients', 'settings', 'expenses', 'invoices',
    'drivers', 'profile', 'workData', 'workLogs', 'subWorkData',
  ]
  if (!KNOWN_KEYS.some((key) => key in record)) return { ok: false, error: INVALID_FILE }

  // 앱 켤 때 검사(owner-state.ts)와 같은 규칙 — 통과 못 하면 다음 실행이 막기 화면에 갇힌다.
  for (const domain of RECORD_DOMAINS) {
    if (domain in record && !matchesDomainSchema(domain, record[domain])) return { ok: false, error: INVALID_FILE }
  }
  const workData = 'workData' in record ? parsePersistedWorkDataMap(record.workData) : undefined
  const workLogs = 'workLogs' in record ? parseLogs(record.workLogs) : undefined
  const subWorkData = 'subWorkData' in record ? parseLogs(record.subWorkData) : undefined
  if (workData === null || workLogs === null || subWorkData === null) return { ok: false, error: INVALID_FILE }

  const snapshot: OwnerSnapshot = {}
  if (workLogs) snapshot.workLogs = workLogs
  else if (subWorkData) snapshot.workLogs = { main: workData || {}, ...subWorkData }
  else if (workData) snapshot.workData = workData
  if (Array.isArray(record.cars)) snapshot.cars = (record.cars) as Array<CarLike>
  if (Array.isArray(record.clients)) snapshot.clients = (record.clients) as Array<ClientLike>
  if (Array.isArray(record.drivers)) snapshot.drivers = (record.drivers) as Array<DriverRecord>
  if (isPlainObject(record.profile)) snapshot.profile = (record.profile) as LocalProfile
  if (isPlainObject(record.settings)) snapshot.settings = (record.settings) as FinanceSettings
  if (Array.isArray(record.expenses)) snapshot.expenses = (record.expenses) as Array<ExpenseItem>
  if (Array.isArray(record.invoices)) snapshot.invoices = (record.invoices) as Array<InvoiceLike>
  if (Array.isArray(record.dismissedNotifications)) snapshot.dismissedNotifications = (record.dismissedNotifications) as Array<string>
  if (isPlainObject(record.workDataDeletedDates)) snapshot.workDataDeletedDates = (record.workDataDeletedDates) as WorkDataTombstones

  const extraWrites: Array<KeyedWrite> = []
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
