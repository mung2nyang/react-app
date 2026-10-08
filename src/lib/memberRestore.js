// @ts-check
// 회원 데이터 불러오기(22-A): 다운로드 파일의 일지 중 지금 없는 날짜만 내 차량에 더한다(덮어쓰기·삭제 없음).
// 연동 기사가 붙은 차량·번호가 맞는 내 차량이 없는 기록은 건너뛰고, 차량을 새로 만들지 않는다.
// 하루 기록의 주유·정비·기타 칸은 지출 기록(22-B)으로 서버에 따로 저장되므로 여기서는 뺀다.
import { readOwnerCars, readOwnerDrivers, readOwnerWorkDataByLogId } from '../store/ownerDataHooks.js'
import { parsePersistedWorkDataMap } from '../store/persistDayRecord.js'
import { isPlainObject } from '../store/persistDomainRecords.js'
import { commitMainDayLogMapToCloud } from './dayLogCloudCommit.js'
import { memberBackupBlockedReason } from './memberBackup.js'

/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
/** @typedef {{ logId: string, records: Record<string, DayRecordLike> }} RestoreTarget */
/** @typedef {{ ok: true, targets: RestoreTarget[], dayCount: number, skippedCars: number }} RestorePlan */

const INVALID_FILE = '파일 내용이 올바르지 않습니다.'
const EXPENSE_KEYS = ['fuelItems', 'maintItems', 'miscItems']

/**
 * 파일의 일지를 차량 칸(main·서브 번호)별로 꺼낸다. 하나라도 모양이 틀리면 null.
 * @param {JsonValue} parsed
 * @returns {Record<string, Record<string, DayRecordLike>>|null}
 */
function readFileLogs(parsed) {
  if (!isPlainObject(parsed)) return null
  /** @type {JsonValue} */
  let logs = null
  if (isPlainObject(parsed.workLogs)) logs = parsed.workLogs
  else if (isPlainObject(parsed.workData)) logs = { main: parsed.workData }
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
 * 파일 칸에 맞는 내 차량 번호(Store 칸 이름). 없거나 서버에 없거나 연동 기사가 붙었으면 null.
 * @param {string} ownerKey @param {string} logId
 */
function ownLogIdFor(ownerKey, logId) {
  const cars = readOwnerCars(ownerKey)
  const car = logId === 'main'
    ? cars.find((item) => item.type === 'main')
    : cars.find((item) => String(item.number || '').trim() === logId)
  if (!car || car.supabaseId == null || car.supabaseId === '') return null
  const plate = String(car.number || '').trim()
  const linked = readOwnerDrivers(ownerKey).some((driver) => (
    String(driver?.status || '') !== 'disconnected' && String(driver?.vehicleNumber || '').trim() === plate
  ))
  return linked ? null : logId
}

/**
 * 파일에서 지금 없는 날짜만 고른다(저장은 안 함).
 * @param {string} ownerKey
 * @param {JsonValue} parsed
 * @returns {RestorePlan | { ok: false, error: string }}
 */
export function planMemberRestore(ownerKey, parsed) {
  const fileLogs = readFileLogs(parsed)
  if (!fileLogs) return { ok: false, error: INVALID_FILE }
  const current = readOwnerWorkDataByLogId(ownerKey)
  /** @type {RestoreTarget[]} */
  const targets = []
  let dayCount = 0
  let skippedCars = 0
  for (const [logId, days] of Object.entries(fileLogs)) {
    if (Object.keys(days).length === 0) continue
    if (!ownLogIdFor(ownerKey, logId)) {
      skippedCars += 1
      continue
    }
    const existing = current[logId] || {}
    /** @type {Record<string, DayRecordLike>} */
    const records = {}
    for (const [dateKey, record] of Object.entries(days)) {
      if (existing[dateKey]) continue
      const kept = withoutExpenseItems(record)
      if (kept) records[dateKey] = kept
    }
    const count = Object.keys(records).length
    if (count === 0) continue
    targets.push({ logId, records })
    dayCount += count
  }
  return { ok: true, targets, dayCount, skippedCars }
}

/**
 * 고른 날짜를 차량별로 서버에 저장한다. 저장 직전 Store를 다시 읽어 그 사이 생긴 날짜는 뺀다.
 * @param {string} ownerKey
 * @param {RestorePlan} plan
 * @returns {Promise<{ ok: boolean, restored: number, toast: string|null }>}
 */
export async function applyMemberRestore(ownerKey, plan) {
  const blocked = memberBackupBlockedReason(ownerKey)
  if (blocked) return { ok: false, restored: 0, toast: blocked }
  let restored = 0
  for (const { logId, records } of plan.targets) {
    const previousData = readOwnerWorkDataByLogId(ownerKey)[logId] || {}
    const dateKeys = Object.keys(records).filter((dateKey) => !previousData[dateKey]).sort()
    if (dateKeys.length === 0) continue
    /** @type {Record<string, DayRecordLike>} */
    const nextData = { ...previousData }
    for (const dateKey of dateKeys) nextData[dateKey] = records[dateKey]
    const res = await commitMainDayLogMapToCloud({ ownerKey, logId, dateKeys, previousData, nextData })
    if (!res.cloud) return { ok: false, restored, toast: '저장할 차량을 찾지 못했습니다. 잠시 후 다시 시도해 주세요.' }
    restored += res.appliedDateKeys.length
    if (!res.ok) return { ok: false, restored, toast: res.toast }
  }
  return { ok: true, restored, toast: null }
}
