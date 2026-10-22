import { dedupeCallDetailsById, withCoercedCallDetailId } from '../../domain/callDetailIds.ts'
import { ALLOWED_CALL_DETAIL_KEYS, isPersistedCallDetail } from '../store/callDetailSchema.ts'
import { DAY_RECORD_KEYS } from '../store/persistDayRecord.ts'
import { isPlainObject } from '../store/persistDomainRecords.ts'
import type { DailyLogRow, DetailRow, MergedDayRecord } from './hydrateMergeTypes.ts'
import type { DayRecordLike } from '../../domain/dayRecordTypes.ts'
import type { JsonRecord, JsonValue } from '../../domain/jsonTypes.ts'

function pickKnownKeys(raw: JsonValue | null | undefined, allowed: ReadonlyArray<string>) {
  if (raw == null || !isPlainObject(raw)) return {}
  const allowedSet = new Set(allowed)
  const picked: JsonRecord = {}
  Object.keys(raw).forEach((key) => {
    if (!allowedSet.has(key)) return
    const field = raw[key]
    if (field !== undefined) picked[key] = field
  })
  return picked
}

export function mergeWorkDataFromRows(localWorkData: Record<string, DayRecordLike>, { dailyRows, transportRows }: { dailyRows?: Array<DailyLogRow> | null, transportRows?: Array<DetailRow> | null, fuelRows?: Array<DetailRow> | null, maintRows?: Array<DetailRow> | null, miscRows?: Array<DetailRow> | null }, deletedDateKeys: Iterable<string> = []) {
  const tombstoned = new Set(deletedDateKeys)
  const byDate: Record<string, MergedDayRecord> = {}
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
  // dailyRows가 배열이면(빈 배열 포함) 서버 날짜 맵이 정본이다 — 로컬 dateKey를 깔면 지운 날짜가 hydrate 뒤 부활한다.
  // fallback은 dailyRows가 배열이 아닐 때(조회 실패 등)만.
  const base = Array.isArray(dailyRows) ? {} : (localWorkData || {})
  const merged = { ...base, ...byDate }
  tombstoned.forEach((dateKey) => { delete merged[dateKey] })
  return merged
}
