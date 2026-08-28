// @ts-check
// Step 0-4 감사 보완(1차/2차): 앱 부트와 Supabase hydrate가 반드시 거쳐야 하는 두 관문.
// - initializeOwnerFromPersist: localStorage에 이미 있는 값으로 store를 "읽기만" 해서 채운다.
// - replaceOwnerState: 서버(hydrate)나 스냅샷 복원처럼 "새 진실"을 owner 전체에 한 번에
//   반영할 때 쓴다. sync:false를 기본으로 두지 않는 이유는 일반 쓰기 경로(초기화가 아닌
//   진짜 로컬 편집)에서도 이 함수를 재사용할 수 있게 열어 두기 위함이고, hydrate 쪽에서는
//   반드시 { sync: false }를 넘겨서 "방금 서버에서 받은 걸 다시 서버로 되쏘는" 핑퐁을 막는다.
//
// 둘 다 app-store.js의 commitBatch를 거친다 — 여러 슬라이스를 한 번에 반영하고 notify를
// 정확히 한 번만 호출한다. 예전엔 슬라이스마다 commit()을 따로 불러서, 구독자가 "cars만
// 반영되고 profile은 아직 안 반영된" 중간 state를 볼 수 있었다.
import { readJsonKey } from './persist.js'
import { commitBatch } from './app-store.js'

/** @typedef {import('./persist.js').PersistDomain} PersistDomain */
/** @typedef {import('./app-store.js').DomainValue} DomainValue */

// 재감사 4차(FAIL 지적 4번) — unknown으로 받던 걸 없앴다. 이 두 함수를 실제로 부르는
// 자리(normalizeFor, readJsonKey<DomainValue>(...)의 결과)가 전부 이미 DomainValue로
// 정확히 타입돼 있어서 unknown일 이유가 없다 — 아래 typeof/Array.isArray 런타임
// 방어는 그대로 남긴다(로컬 JSON이 실제로 깨져 있을 수 있는 값에 대한 방어라, 정적
// 타입을 좁혀도 필요하다).
// 재감사 10차(FAIL 지적 4번) — DomainValue가 object/Array<object>에서 실제 도메인
// 타입 합집합으로 바뀌면서, 여기서도 그 정직한 합집합을 그대로 돌려준다. 이 두
// 함수는 domain 문자열만 보고는 "9개 슬라이스 중 정확히 어느 갈래인지" 정적으로
// 알 수 없다(OBJECT_DOMAINS는 런타임 Set이다) — Array.isArray/typeof로 실제 좁힌
// 뒤에는 그 갈래를 그대로 DomainValue로 돌려줄 수 있고, 대체용 빈 값({}/[])만 정직한
// 단언이 필요하다(빈 객체/빈 배열은 DomainValue의 모든 갈래를 구조적으로 만족한다).
/** @param {DomainValue} value @returns {DomainValue} */
function toArray(value) {
  return Array.isArray(value) ? value : /** @type {DomainValue} */ ([])
}

/** @param {DomainValue} value @returns {DomainValue} */
function toObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : /** @type {DomainValue} */ ({})
}

// 재감사 3차(FAIL 지적 1번) — workDataDeletedDates("아직 서버에 못 알린 빈 날 삭제"
// 목록, domain/workDataTombstones.js)도 새로고침 뒤에 살아남아야 다음 hydrate/동기화가
// "삭제를 아직 못 알렸다"는 사실을 잊지 않는다 — object 계열(workData/settings/profile과
// 같은 dateKey->값 맵) 취급이다.
/** @type {Array<PersistDomain>} */
const DOMAINS = ['workData', 'cars', 'clients', 'settings', 'expenses', 'invoices', 'drivers', 'profile', 'dismissedNotifications', 'workDataDeletedDates']
/** @type {Set<PersistDomain>} */
const OBJECT_DOMAINS = new Set(['settings', 'profile', 'workData', 'workDataDeletedDates'])

/** @param {PersistDomain} domain @returns {DomainValue} */
function fallbackFor(domain) {
  return OBJECT_DOMAINS.has(domain) ? {} : []
}

/** @param {PersistDomain} domain @param {DomainValue} value @returns {DomainValue} */
function normalizeFor(domain, value) {
  return OBJECT_DOMAINS.has(domain) ? toObject(value) : toArray(value)
}

/**
 * localStorage에 이미 저장된 값을 store에 읽어 들인다. 아무것도 새로 쓰지 않고,
 * 클라우드 동기화도 예약하지 않는다 — 순수 "state를 persist와 맞춘다"만 한다.
 * commitBatch(persist:false, syncToCloud:false)를 거치므로 notify는 한 번만 나간다.
 * @param {string} ownerKey
 */
export function initializeOwnerFromPersist(ownerKey) {
  const entries = DOMAINS.map((domain) => ({
    domain,
    ownerKey,
    value: normalizeFor(domain, readJsonKey(domain, ownerKey, fallbackFor(domain))),
  }))
  commitBatch(entries, { persist: false, syncToCloud: false })
}

/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */
/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */
/** @typedef {import('../domain/financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('../domain/expenseTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */
/** @typedef {import('../lib/outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {import('../lib/hydrateMergeTypes.js').LocalProfile} ProfileLike */

/**
 * @typedef {Object} OwnerSnapshot
 * @property {Record<string, DayRecordLike>} [workData]
 * @property {Array<CarLike>} [cars]
 * @property {Array<ClientLike>} [clients]
 * @property {Array<DriverRecord>} [drivers]
 * @property {ProfileLike} [profile]
 * @property {FinanceSettings} [settings]
 * @property {Array<ExpenseItem>} [expenses]
 * @property {Array<InvoiceLike>} [invoices]
 */

/**
 * owner 전체 슬라이스를 스냅샷으로 원자적으로 교체한다(cloudSync.js의
 * collectPracticeSnapshot과 같은 모양). 각 필드는 있을 때만 반영 — 부분 스냅샷도
 * 안전하다. commitBatch 한 번으로 localStorage 쓰기 + state 갱신 + notify(1회)가 전부
 * 끝난다 — 중간에 구독자가 절반만 반영된 snapshot을 볼 일이 없다.
 * @param {string} ownerKey
 * @param {OwnerSnapshot} [snapshot]
 * @param {{ sync?: boolean }} [options]
 */
export function replaceOwnerState(ownerKey, snapshot = {}, options = {}) {
  const { sync = true } = options
  /** @type {Array<import('./app-store.js').BatchEntry>} */
  const entries = []
  if (snapshot.workData && typeof snapshot.workData === 'object') entries.push({ domain: 'workData', ownerKey, value: snapshot.workData })
  if (Array.isArray(snapshot.cars)) entries.push({ domain: 'cars', ownerKey, value: snapshot.cars })
  if (Array.isArray(snapshot.clients)) entries.push({ domain: 'clients', ownerKey, value: snapshot.clients })
  if (Array.isArray(snapshot.drivers)) entries.push({ domain: 'drivers', ownerKey, value: snapshot.drivers })
  if (snapshot.profile && typeof snapshot.profile === 'object') entries.push({ domain: 'profile', ownerKey, value: snapshot.profile })
  if (snapshot.settings && typeof snapshot.settings === 'object') entries.push({ domain: 'settings', ownerKey, value: snapshot.settings })
  if (Array.isArray(snapshot.expenses)) entries.push({ domain: 'expenses', ownerKey, value: snapshot.expenses })
  if (Array.isArray(snapshot.invoices)) entries.push({ domain: 'invoices', ownerKey, value: snapshot.invoices })
  if (!entries.length) return
  commitBatch(entries, { persist: true, syncToCloud: sync })
}
