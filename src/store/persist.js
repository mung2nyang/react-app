// @ts-check
// localStorage 저장 키를 한 곳에 고정한다. 값을 바꾸면 이미 저장된 사용자 데이터를 못 읽으므로 절대 바꾸지 않는다.
import { parsePersistedWorkDataMap } from './persistDayRecord.js'

/**
 * @typedef {'workData'|'cars'|'clients'|'settings'|'expenses'|'invoices'|'drivers'|'profile'|'dismissedNotifications'|'workDataDeletedDates'} PersistDomain
 */

/** @type {Record<PersistDomain, string>} */
export const PERSIST_KEYS = Object.freeze({
  workData: 'reactPracticeWorkData',
  cars: 'reactPracticeCars',
  clients: 'reactPracticeClients',
  settings: 'reactPracticeSettings',
  expenses: 'reactPracticeExpenses',
  invoices: 'reactPracticeInvoices',
  drivers: 'reactPracticeDrivers',
  profile: 'reactPracticeProfile',
  dismissedNotifications: 'reactPracticeDismissedNotifs',
  // 빈 날 삭제 목록(domain/workDataTombstones.js).
  workDataDeletedDates: 'reactPracticeWorkDataDeletedDates',
})

/**
 * @param {PersistDomain} domain
 * @param {string} ownerKey
 * @returns {string}
 */
export function storageKeyFor(domain, ownerKey) {
  const prefix = PERSIST_KEYS[domain]
  if (!prefix) throw new Error(`[persist] 알 수 없는 도메인입니다: ${domain}`)
  return `${prefix}:${ownerKey}`
}

/**
 * 서브 차량 로컬 일지 키. 메인(`workData`) persist 문자열은 그대로 두고
 * 같은 prefix 뒤에 `:log:${차량번호}`만 붙인다.
 * @param {string} ownerKey
 * @param {string} logId 차량번호. `main`이면 메인 workData 키.
 */
export function storageKeyForLog(ownerKey, logId) {
  if (!logId || logId === 'main') return storageKeyFor('workData', ownerKey)
  return `${PERSIST_KEYS.workData}:${ownerKey}:log:${logId}`
}

/**
 * @typedef {{ ok: true, kind: 'missing', value: Record<string, import('../domain/dayRecordTypes.js').DayRecordLike> }
 *   | { ok: true, kind: 'value', value: Record<string, import('../domain/dayRecordTypes.js').DayRecordLike> }
 *   | { ok: false, kind: 'getItem' | 'parse' | 'schema' }} LogWorkDataRead
 */

/**
 * 서브/메인 일지 persist 읽기. 키 부재와 읽기 실패를 구분한다 — 실패를 `{}`로 바꾸지 않는다.
 * dateKey와 DayRecord 중첩(숫자·불리언·fixedRouteCounts·callDetails·payments)을 검증한다.
 * @param {string} ownerKey
 * @param {string} [logId]
 * @returns {LogWorkDataRead}
 */
export function readLogWorkData(ownerKey, logId = 'main') {
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
 * @template T
 * @param {PersistDomain} domain
 * @param {string} ownerKey
 * @param {T} fallback
 * @returns {T}
 */
export function readJsonKey(domain, ownerKey, fallback) {
  try {
    const raw = localStorage.getItem(storageKeyFor(domain, ownerKey))
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

/**
 * @template T
 * @param {PersistDomain} domain
 * @param {string} ownerKey
 * @param {T} value
 */
export function writeJsonKey(domain, ownerKey, value) {
  localStorage.setItem(storageKeyFor(domain, ownerKey), JSON.stringify(value))
}
