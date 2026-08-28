// @ts-check
// Step 1 스토어 껍데기: localStorage persist 키 계약을 한 곳에 고정한다.
// 아래 9개 키 문자열은 기존 src/lib/*.js 각자가 갖고 있던 STORAGE_PREFIX / DISMISS_PREFIX
// 값과 완전히 동일하다. 이 파일이 유일한 출처가 되며, 값 자체를 바꾸면 기존에 저장된
// 사용자 데이터와 클라우드 동기화가 갈라지므로 절대 바꾸지 않는다.
// (migration-plan.md 1.1 저장소 계약 / migration-audit-plan.md Step 1)

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
