import * as v from 'valibot'
import { isValidCalendarDateKey } from '../../domain/dateKey.ts'
import { isPersistedCallDetail, isValidCurrencyAmount } from './callDetailSchema.ts'
import { bool, by, finiteNumber, isPlainObject, opt, plain, str } from '../../domain/schemaParts.ts'
import { isPersistedFuelList, isPersistedMaintList, isPersistedMiscList } from './persistDayRecordLegacy.ts'
import type { JsonValue } from '../../domain/jsonTypes.ts'
import type { DayRecordLike } from '../../domain/dayRecordTypes.ts'

// 하루 기록의 칸 → 모양(Valibot, 공용 조각은 domain/schemaParts.ts). 목록 밖 칸·값이 비어 있는 칸은 거부.
const count = v.pipe(v.number(), v.integer(), v.minValue(0))
const amount = by(isValidCurrencyAmount)

const DAY_RECORD_FIELDS = {
  isOff: opt(bool), fixedCount: opt(count), palletCount: opt(count),
  callDetails: opt(v.array(by(isPersistedCallDetail))),
  fixedRouteCounts: opt(plain(v.record(str, count))),
  fare: opt(amount), fixedFare: opt(amount), totalFare: opt(amount), count: opt(count),
  dailyDistance: opt(v.pipe(finiteNumber, v.minValue(0))),
  fuelItems: opt(by(isPersistedFuelList)), maintItems: opt(by(isPersistedMaintList)), miscItems: opt(by(isPersistedMiscList)),
  assignedVehicleNumber: opt(str),
}

const DAY_RECORD_KEYS = Object.keys(DAY_RECORD_FIELDS)

// 빈 하루 {}는 기록으로 치지 않는다.
const DAY_RECORD = plain(v.strictObject(DAY_RECORD_FIELDS), (value) => Object.keys(value).length > 0)

export function canonicalizeDayRecord(value: JsonValue) {
  return value === 'off' ? { isOff: true } : value
}

/** persist된 하루 기록. 허용 키만 두고, 카운트는 음이 아닌 정수, 운임은 통화 금액이다. */
export function isPersistedDayRecord(value: JsonValue): value is DayRecordLike {
  return v.is(DAY_RECORD, value)
}

export function parsePersistedWorkDataMap(parsed: JsonValue): Record<string, DayRecordLike> | null {
  if (!isPlainObject(parsed)) return null
  const out: Record<string, DayRecordLike> = {}
  for (const [dateKey, record] of Object.entries(parsed)) {
    if (!isValidCalendarDateKey(dateKey)) return null
    const canonical = canonicalizeDayRecord(record)
    if (!isPersistedDayRecord(canonical)) return null
    out[dateKey] = canonical
  }
  return out
}

export function isPersistedWorkDataMap(parsed: JsonValue): parsed is Record<string, DayRecordLike> {
  return parsePersistedWorkDataMap(parsed) !== null
}

export { DAY_RECORD_KEYS }
