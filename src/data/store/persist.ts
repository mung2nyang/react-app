// localStorage 저장 키를 한 곳에 고정한다. 값을 바꾸면 이미 저장된 사용자 데이터를 못 읽으므로 절대 바꾸지 않는다.
import { parsePersistedWorkDataMap } from './persistDayRecord.ts'
import type { DayRecordLike } from '../../domain/dayRecordTypes.ts'

export type PersistDomain = 'workData' | 'cars' | 'clients' | 'settings' | 'expenses' | 'invoices' | 'drivers' | 'profile' | 'dismissedNotifications' | 'workDataDeletedDates'

export const PERSIST_KEYS: Record<PersistDomain, string> = Object.freeze({
  workData: 'reactPracticeWorkData',
  cars: 'reactPracticeCars',
  clients: 'reactPracticeClients',
  settings: 'reactPracticeSettings',
  expenses: 'reactPracticeExpenses',
  invoices: 'reactPracticeInvoices',
  drivers: 'reactPracticeDrivers',
  profile: 'reactPracticeProfile',
  dismissedNotifications: 'reactPracticeDismissedNotifs',
  // 빈 날 삭제 목록(domain/workDataTombstones.ts).
  workDataDeletedDates: 'reactPracticeWorkDataDeletedDates',
})

export function storageKeyFor(domain: PersistDomain, ownerKey: string): string {
  const prefix = PERSIST_KEYS[domain]
  if (!prefix) throw new Error(`[persist] 알 수 없는 도메인입니다: ${domain}`)
  return `${prefix}:${ownerKey}`
}

/**
 * 서브 차량 로컬 일지 키. 메인(`workData`) persist 문자열은 그대로 두고
 * 같은 prefix 뒤에 `:log:${차량번호}`만 붙인다.
 * @param logId 차량번호. `main`이면 메인 workData 키.
 */
export function storageKeyForLog(ownerKey: string, logId: string) {
  if (!logId || logId === 'main') return storageKeyFor('workData', ownerKey)
  return `${PERSIST_KEYS.workData}:${ownerKey}:log:${logId}`
}

export type LogWorkDataRead = { ok: true, kind: 'missing', value: Record<string, DayRecordLike> }
  | { ok: true, kind: 'value', value: Record<string, DayRecordLike> }
  | { ok: false, kind: 'getItem' | 'parse' | 'schema' }

/**
 * 서브/메인 일지 persist 읽기. 키 부재와 읽기 실패를 구분한다 — 실패를 `{}`로 바꾸지 않는다.
 * dateKey와 DayRecord 중첩(숫자·불리언·fixedRouteCounts·callDetails·payments)을 검증한다.
 */
export function readLogWorkData(ownerKey: string, logId = 'main'): LogWorkDataRead {
  const key = storageKeyForLog(ownerKey, logId)
  let raw
  try {
    raw = localStorage.getItem(key)
  } catch {
    return { ok: false, kind: 'getItem' }
  }
  if (raw === null) return { ok: true, kind: 'missing', value: {} }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, kind: 'parse' }
  }
  const mapped = parsePersistedWorkDataMap(parsed)
  if (!mapped) return { ok: false, kind: 'schema' }
  return { ok: true, kind: 'value', value: mapped }
}

/**
 * raw JSON을 그대로 읽는다. 값이 없거나 JSON.parse가 실패하면 fallback을 돌려준다.
 * 배열/객체 형태 검증은 각 lib 모듈의 load*가 지금까지 해오던 대로 호출부에서 계속한다
 * (이 함수가 임의로 형태를 바꾸면 기존 방어 로직과 결과가 달라질 수 있다).
 */
export function readJsonKey<T>(domain: PersistDomain, ownerKey: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(storageKeyFor(domain, ownerKey))
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function writeJsonKey<T>(domain: PersistDomain, ownerKey: string, value: T) {
  localStorage.setItem(storageKeyFor(domain, ownerKey), JSON.stringify(value))
}
