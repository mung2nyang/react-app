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
 * @param {{ dailyRows?: Array<DailyLogRow>, transportRows?: Array<DetailRow>, fuelRows?: Array<DetailRow>, maintRows?: Array<DetailRow>, miscRows?: Array<DetailRow> }} rows
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
  const merged = { ...(localWorkData || {}), ...byDate }
  tombstoned.forEach((dateKey) => { delete merged[dateKey] })
  return merged
}
