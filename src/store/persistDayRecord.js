// @ts-check
import { isValidCalendarDateKey } from '../domain/dateKey.js'
import { isPersistedCallDetail, isValidCurrencyAmount } from '../lib/callDetailSchema.js'
import { hasOnlyKeys, isFiniteNumber, isPlainObject } from './persistDomainRecords.js'
import { isPersistedFuelList, isPersistedMaintList, isPersistedMiscList } from './persistDayRecordLegacy.js'

/** @typedef {import('../lib/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */

const DAY_RECORD_KEYS = [
  'isOff', 'fixedCount', 'palletCount', 'callDetails', 'fixedRouteCounts',
  'fare', 'fixedFare', 'totalFare', 'count', 'dailyDistance',
  'fuelItems', 'maintItems', 'miscItems',
]

/** @param {JsonValue} value @returns {value is number} */
function isNonNegativeInteger(value) {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
}

/** @param {JsonValue} value */
export function canonicalizeDayRecord(value) {
  return value === 'off' ? { isOff: true } : value
}

/**
 * persist된 하루 기록. 허용 키만 두고, 카운트는 음이 아닌 정수, 운임은 통화 금액이다.
 * @param {JsonValue} value
 * @returns {value is DayRecordLike}
 */
export function isPersistedDayRecord(value) {
  if (!isPlainObject(value) || !hasOnlyKeys(value, DAY_RECORD_KEYS) || Object.keys(value).length === 0) return false
  if ('isOff' in value && typeof value.isOff !== 'boolean') return false
  if ('fixedCount' in value && !isNonNegativeInteger(value.fixedCount)) return false
  if ('palletCount' in value && !isNonNegativeInteger(value.palletCount)) return false
  if ('count' in value && !isNonNegativeInteger(value.count)) return false
  if ('dailyDistance' in value && !(isFiniteNumber(value.dailyDistance) && Number(value.dailyDistance) >= 0)) return false
  if ('fare' in value && !isValidCurrencyAmount(value.fare)) return false
  if ('fixedFare' in value && !isValidCurrencyAmount(value.fixedFare)) return false
  if ('totalFare' in value && !isValidCurrencyAmount(value.totalFare)) return false
  if ('fixedRouteCounts' in value) {
    if (!isPlainObject(value.fixedRouteCounts)) return false
    for (const count of Object.values(value.fixedRouteCounts)) {
      if (!isNonNegativeInteger(count)) return false
    }
  }
  if ('callDetails' in value) {
    if (!Array.isArray(value.callDetails)) return false
    for (const item of value.callDetails) {
      if (!isPersistedCallDetail(item)) return false
    }
  }
  if ('fuelItems' in value && !isPersistedFuelList(value.fuelItems)) return false
  if ('maintItems' in value && !isPersistedMaintList(value.maintItems)) return false
  if ('miscItems' in value && !isPersistedMiscList(value.miscItems)) return false
  return true
}

/**
 * @param {JsonValue} parsed
 * @returns {Record<string, DayRecordLike>|null}
 */
export function parsePersistedWorkDataMap(parsed) {
  if (!isPlainObject(parsed)) return null
  /** @type {Record<string, DayRecordLike>} */
  const out = {}
  for (const [dateKey, record] of Object.entries(parsed)) {
    if (!isValidCalendarDateKey(dateKey)) return null
    const canonical = canonicalizeDayRecord(record)
    if (!isPersistedDayRecord(canonical)) return null
    out[dateKey] = canonical
  }
  return out
}

/** @param {JsonValue} parsed @returns {parsed is Record<string, DayRecordLike>} */
export function isPersistedWorkDataMap(parsed) {
  return parsePersistedWorkDataMap(parsed) !== null
}

export { DAY_RECORD_KEYS }
