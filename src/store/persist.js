// @ts-check
// Step 1 스토어 껍데기: localStorage persist 키 계약을 한 곳에 고정한다.
// 아래 9개 키 문자열은 기존 src/lib/*.js 각자가 갖고 있던 STORAGE_PREFIX / DISMISS_PREFIX
// 값과 완전히 동일하다. 이 파일이 유일한 출처가 되며, 값 자체를 바꾸면 기존에 저장된
// 사용자 데이터와 클라우드 동기화가 갈라지므로 절대 바꾸지 않는다.
// (migration-plan.md 1.1 저장소 계약 / migration-audit-plan.md Step 1)
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
  // 재감사 3차(FAIL 지적 1번) — "아직 서버에 못 알린 빈 날 삭제" 목록(domain/
  // workDataTombstones.js). 기존 9개 키는 위 주석대로 값을 바꾸지 않았고, 이건 그
  // 9개에 새로 추가하는 10번째 키다(기존 사용자 데이터와 무관한 새 기능).
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
 * 같은 prefix 뒤에 `:log:${차량번호}`만 붙인다. `syncWorkData.js`는 메인
 * 키만 읽으므로 이 키의 클라우드 동기화는 Step 9 범위다.
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
