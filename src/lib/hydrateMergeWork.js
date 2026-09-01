// @ts-check
import { dedupeCallDetailsById, withCoercedCallDetailId } from '../domain/callDetailIds.js'
import { ALLOWED_CALL_DETAIL_KEYS, isPersistedCallDetail } from './callDetailSchema.js'
import { DAY_RECORD_KEYS } from '../store/persistDayRecord.js'
import { isPlainObject } from '../store/persistDomainRecords.js'

/** @typedef {import('./hydrateMergeTypes.js').DailyLogRow} DailyLogRow */
/** @typedef {import('./hydrateMergeTypes.js').DetailRow} DetailRow */
/** @typedef {import('./hydrateMergeTypes.js').MergedDayRecord} MergedDayRecord */
/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
/** @typedef {import('./pendingWorkDataWritesTypes.js').JsonRecord} JsonRecord */

/** @param {JsonValue|null|undefined} raw @param {ReadonlyArray<string>} allowed */
function pickKnownKeys(raw, allowed) {
  if (raw == null || !isPlainObject(raw)) return {}
  const allowedSet = new Set(allowed)
  /** @type {JsonRecord} */
  const picked = {}
  Object.keys(raw).forEach((key) => {
    if (!allowedSet.has(key)) return
    const field = raw[key]
    if (field !== undefined) picked[key] = field
  })
  return picked
}

/**
 * @param {Record<string, DayRecordLike>} localWorkData
 * @param {{ dailyRows?: Array<DailyLogRow>|null, transportRows?: Array<DetailRow>|null, fuelRows?: Array<DetailRow>|null, maintRows?: Array<DetailRow>|null, miscRows?: Array<DetailRow>|null }} rows
 * @param {Iterable<string>} [deletedDateKeys]
 */
export function mergeWorkDataFromRows(localWorkData, { dailyRows, transportRows }, deletedDateKeys = []) {
  const tombstoned = new Set(deletedDateKeys)
  /** @type {Record<string, MergedDayRecord>} */
  const byDate = {}
  ;(dailyRows || []).forEach((row) => {
    if (tombstoned.has(row.work_date)) return
    const picked = pickKnownKeys(row.raw, DAY_RECORD_KEYS)
    delete picked.fuelItems
    delete picked.maintItems
    delete picked.miscItems
    delete picked.callDetails
    byDate[row.work_date] = {
      ...picked,
      isOff: !!row.is_off,
      fixedCount: row.fixed_count || 0,
      callDetails: [],
    }
  })
  ;(transportRows || []).forEach((row) => {
    if (!byDate[row.work_date]) return
    const picked = withCoercedCallDetailId(pickKnownKeys(row.raw, ALLOWED_CALL_DETAIL_KEYS))
    if (!isPersistedCallDetail(picked)) return
    byDate[row.work_date].callDetails.push(picked)
  })
  Object.values(byDate).forEach((day) => {
    day.callDetails = dedupeCallDetailsById(day.callDetails)
  })
  // 슬라이스 D(2026-09-01): dailyRows가 배열이면(빈 배열 포함) 서버 날짜 맵이 정본이다.
  // 로컬 dateKey를 밑에 깔면 서버에서 지운(또는 원래 없던) 날짜가 hydrate 뒤 부활한다
  // (B·C와 같은 함정). fallback은 dailyRows가 배열이 아닐 때(조회 실패 등)만.
  const base = Array.isArray(dailyRows) ? {} : (localWorkData || {})
  const merged = { ...base, ...byDate }
  tombstoned.forEach((dateKey) => { delete merged[dateKey] })
  return merged
}
