// 로그인 일지 서버 저장에 실패한 날짜 목록 — 앱을 껐다 켜도 알림이 남게 휴대폰에 날짜만 둔다(입력 내용·재시도 없음).
import { isValidCalendarDateKey } from '../../domain/dateKey.ts'
import type { JsonValue } from '../../domain/jsonTypes.ts'

export type FailedDayLogDate = { logId: string, dateKey: string }
type Stored = Record<string, Array<FailedDayLogDate>>

const STORAGE_KEY = 'drivelogFailedDayLogDates'
const listeners = new Set<() => void>()
let version = 0

function toEntry(value: JsonValue): FailedDayLogDate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { logId, dateKey } = value
  if (typeof logId !== 'string' || logId === '' || typeof dateKey !== 'string' || !isValidCalendarDateKey(dateKey)) return null
  return { logId, dateKey }
}

/** 휴대폰 값 읽기 — 못 읽거나 깨졌으면 빈 목록, 깨진 항목만 뺀다. */
function readAll(): Stored {
  try {
    const parsed = (JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')) as JsonValue
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: Stored = {}
    for (const [ownerKey, list] of Object.entries(parsed)) {
      if (Array.isArray(list)) result[ownerKey] = list.map(toEntry).filter((item) => item !== null)
    }
    return result
  } catch {
    return {}
  }
}

function writeAll(next: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* 저장 못 하면 이번만 기록 없이 — 일지 저장 흐름은 그대로 */
  }
  version += 1
  listeners.forEach((listener) => listener())
}

export function listFailedDayLogDates(ownerKey: string): Array<FailedDayLogDate> {
  return readAll()[ownerKey] || []
}

export function addFailedDayLogDate(ownerKey: string, logId: string, dateKey: string) {
  const all = readAll()
  const list = all[ownerKey] || []
  if (list.some((item) => item.logId === logId && item.dateKey === dateKey)) return
  writeAll({ ...all, [ownerKey]: [...list, { logId, dateKey }] })
}

export function removeFailedDayLogDate(ownerKey: string, logId: string, dateKey: string) {
  const all = readAll()
  const list = all[ownerKey] || []
  const next = list.filter((item) => !(item.logId === logId && item.dateKey === dateKey))
  if (next.length === list.length) return
  writeAll({ ...all, [ownerKey]: next })
}

/** 화면 구독용 지금 값 — 목록이 바뀔 때만 달라진다. */
export function failedDayLogDatesVersion() {
  return version
}

/** 목록이 바뀌면 부른다. 돌려준 함수가 구독 해제. */
export function subscribeFailedDayLogDates(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
