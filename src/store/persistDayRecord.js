// @ts-check
import * as v from 'valibot'
import { isValidCalendarDateKey } from '../domain/dateKey.js'
import { isPersistedCallDetail, isValidCurrencyAmount } from '../lib/callDetailSchema.js'
import { isPlainObject } from './persistDomainRecords.js'
import { isPersistedFuelList, isPersistedMaintList, isPersistedMiscList } from './persistDayRecordLegacy.js'

/** @typedef {import('../lib/pendingWorkDataWritesTypes.js').JsonValue} JsonValue */
/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */

// 하루 기록의 칸 → 모양(Valibot). 목록 밖 칸·값이 비어 있는 칸은 거부.
const opt = v.exactOptional
const count = v.pipe(v.number(), v.integer(), v.minValue(0))
/** @param {(value: JsonValue) => boolean} check */
const by = (check) => v.custom((input) => check(/** @type {JsonValue} */ (input)))
const amount = by(isValidCurrencyAmount)
/** Valibot은 배열도 객체로 받고 검사 뒤엔 새 객체를 넘기므로, 객체 검사 앞에서 배열을 먼저 거른다. @param {(value: Record<string, JsonValue>) => boolean} [extra] */
const plainObject = (extra = () => true) => by((input) => isPlainObject(input) && extra(input))

const DAY_RECORD_FIELDS = {
  isOff: opt(v.boolean()), fixedCount: opt(count), palletCount: opt(count),
  callDetails: opt(v.array(by(isPersistedCallDetail))),
  fixedRouteCounts: opt(v.pipe(plainObject(), v.record(v.string(), count))),
  fare: opt(amount), fixedFare: opt(amount), totalFare: opt(amount), count: opt(count),
  dailyDistance: opt(v.pipe(v.number(), v.finite(), v.minValue(0))),
  fuelItems: opt(by(isPersistedFuelList)), maintItems: opt(by(isPersistedMaintList)), miscItems: opt(by(isPersistedMiscList)),
  assignedVehicleNumber: opt(v.string()),
}

const DAY_RECORD_KEYS = Object.keys(DAY_RECORD_FIELDS)

// 빈 하루 {}는 기록으로 치지 않는다.
const DAY_RECORD = v.pipe(plainObject((value) => Object.keys(value).length > 0), v.strictObject(DAY_RECORD_FIELDS))

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
  return v.is(DAY_RECORD, value)
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
