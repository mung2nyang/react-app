// @ts-check
// 회원 데이터 불러오기(22-A·B): 다운로드 파일에서 지금 없는 것만 더한다(덮어쓰기·삭제 없음).
// 일지는 여기서, 거래처·지출·세금계산서는 memberRestoreRecords.js. 저장 순서는 거래처 → 일지 → 지출 → 계산서.
// 하루 기록의 주유·정비·기타 칸은 지출 기록으로 따로 저장되므로 일지에서는 뺀다.
import { readOwnerWorkDataByLogId } from '../store/ownerDataHooks.js'
import { parsePersistedWorkDataMap } from '../store/persistDayRecord.js'
import { isPlainObject } from '../store/persistDomainRecords.js'
import { commitMainDayLogMapToCloud } from './dayLogCloudCommit.js'
import { memberBackupBlockedReason } from './memberBackup.js'
import { isOwnUnlinkedCar, pickMemberRecords, restoreClients, restoreExpenses, restoreInvoices } from './memberRestoreRecords.js'

/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
/** @typedef {{ logId: string, records: Record<string, DayRecordLike> }} RestoreTarget */
/** @typedef {{ days: number, clients: number, expenses: number, invoices: number }} RestoreCounts */
/** @typedef {{ ok: true, targets: RestoreTarget[], records: import('./memberRestoreRecords.js').RecordPicks,
 *   counts: RestoreCounts, skipped: number }} RestorePlan */

const INVALID_FILE = '파일 내용이 올바르지 않습니다.'
const EXPENSE_KEYS = ['fuelItems', 'maintItems', 'miscItems']
const KNOWN_KEYS = ['workLogs', 'workData', 'clients', 'expenses', 'invoices']

/**
 * 파일의 일지를 차량 칸(main·서브 번호)별로 꺼낸다. 하나라도 모양이 틀리면 null.
 * @param {JsonValue} parsed
 * @returns {Record<string, Record<string, DayRecordLike>>|null}
 */
function readFileLogs(parsed) {
  if (!isPlainObject(parsed)) return null
  /** @type {JsonValue} */
  let logs = null
  if ('workLogs' in parsed) logs = parsed.workLogs
  else if ('workData' in parsed) logs = { main: parsed.workData }
  else return {}
  if (!isPlainObject(logs)) return null
  /** @type {Record<string, Record<string, DayRecordLike>>} */
  const out = {}
  for (const [logId, map] of Object.entries(logs)) {
    const days = parsePersistedWorkDataMap(map)
    if (!days) return null
    out[logId] = days
  }
  return out
}

/** @param {DayRecordLike} record @returns {DayRecordLike|null} 지출 칸을 뺀 기록(남는 게 없으면 null) */
function withoutExpenseItems(record) {
  /** @type {Record<string, unknown>} */
  const copy = { ...record }
  for (const key of EXPENSE_KEYS) delete copy[key]
  return Object.keys(copy).length > 0 ? /** @type {DayRecordLike} */ (copy) : null
}

/**
 * 파일에서 지금 없는 날짜만 고른다(저장은 안 함).
 * @param {string} ownerKey
 * @param {JsonValue} parsed
 * @returns {RestorePlan | { ok: false, error: string }}
 */
export function planMemberRestore(ownerKey, parsed) {
  const fileLogs = readFileLogs(parsed)
  const records = pickMemberRecords(ownerKey, parsed)
  const known = isPlainObject(parsed) && KNOWN_KEYS.some((key) => key in parsed)
  if (!known || !fileLogs || !records) return { ok: false, error: INVALID_FILE }
  const current = readOwnerWorkDataByLogId(ownerKey)
  /** @type {RestoreTarget[]} */
  const targets = []
  let dayCount = 0
  let skippedCars = 0
  for (const [logId, days] of Object.entries(fileLogs)) {
    if (Object.keys(days).length === 0) continue
    if (!isOwnUnlinkedCar(ownerKey, logId)) {
      skippedCars += 1
      continue
    }
    const existing = current[logId] || {}
    /** @type {Record<string, DayRecordLike>} */
    const picked = {}
    for (const [dateKey, record] of Object.entries(days)) {
      if (existing[dateKey]) continue
      const kept = withoutExpenseItems(record)
      if (kept) picked[dateKey] = kept
    }
    const count = Object.keys(picked).length
    if (count === 0) continue
    targets.push({ logId, records: picked })
    dayCount += count
  }
  const counts = { days: dayCount, clients: records.clients.length, expenses: records.expenses.length, invoices: records.invoices.length }
  return { ok: true, targets, records, counts, skipped: skippedCars + records.skippedItems }
}

/**
 * 고른 날짜를 차량별로 서버에 저장한다. 저장 직전 Store를 다시 읽어 그 사이 생긴 날짜는 뺀다.
 * @param {string} ownerKey @param {RestoreTarget[]} targets
 * @returns {Promise<{ ok: boolean, count: number, toast: string|null }>}
 */
async function restoreDays(ownerKey, targets) {
  let count = 0
  for (const { logId, records } of targets) {
    const previousData = readOwnerWorkDataByLogId(ownerKey)[logId] || {}
    const dateKeys = Object.keys(records).filter((dateKey) => !previousData[dateKey]).sort()
    if (dateKeys.length === 0) continue
    /** @type {Record<string, DayRecordLike>} */
    const nextData = { ...previousData }
    for (const dateKey of dateKeys) nextData[dateKey] = records[dateKey]
    const res = await commitMainDayLogMapToCloud({ ownerKey, logId, dateKeys, previousData, nextData })
    if (!res.cloud) return { ok: false, count, toast: '저장할 차량을 찾지 못했습니다. 잠시 후 다시 시도해 주세요.' }
    count += res.appliedDateKeys.length
    if (!res.ok) return { ok: false, count, toast: res.toast }
  }
  return { ok: true, count, toast: null }
}

/**
 * 거래처 → 일지 → 지출 → 세금계산서 순서로 저장한다. 한 단계라도 실패하면 거기서 멈춘다.
 * @param {string} ownerKey
 * @param {RestorePlan} plan
 * @returns {Promise<{ ok: boolean, counts: RestoreCounts, toast: string|null }>}
 */
export async function applyMemberRestore(ownerKey, plan) {
  /** @type {RestoreCounts} */
  const counts = { days: 0, clients: 0, expenses: 0, invoices: 0 }
  const blocked = memberBackupBlockedReason(ownerKey)
  if (blocked) return { ok: false, counts, toast: blocked }
  /** @type {Array<[keyof RestoreCounts, () => Promise<{ ok: boolean, count: number, toast: string|null }>]>} */
  const steps = [
    ['clients', () => restoreClients(ownerKey, plan.records.clients)],
    ['days', () => restoreDays(ownerKey, plan.targets)],
    ['expenses', () => restoreExpenses(ownerKey, plan.records.expenses)],
    ['invoices', () => restoreInvoices(ownerKey, plan.records.invoices)],
  ]
  for (const [key, run] of steps) {
    const res = await run()
    counts[key] = res.count
    if (!res.ok) return { ok: false, counts, toast: res.toast }
  }
  return { ok: true, counts, toast: null }
}
