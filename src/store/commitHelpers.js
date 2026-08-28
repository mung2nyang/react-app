// @ts-check
// Step 1~4 스토어 껍데기: commitBatch를 감싸는 단일 도메인 편의 함수들. app-store.js에서
// 분리한 이유는 200줄 제한 — 로직은 전혀 없고 전부 commitBatch([{ domain, ... }])의
// 얇은 래퍼다.
import { commitBatch } from './app-store.js'

/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */
/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */
/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */
/** @typedef {import('../domain/financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('../domain/expenseTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */
/** @typedef {import('../lib/outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {import('../lib/hydrateMergeTypes.js').LocalProfile} ProfileLike */

/**
 * @template {import('./app-store.js').DomainValue} T
 * @param {import('./persist.js').PersistDomain} domain
 * @param {string} ownerKey
 * @param {T} value
 * @param {{ syncToCloud?: boolean }} [options]
 * @returns {T}
 */
function commit(domain, ownerKey, value, options = {}) {
  const [result] = commitBatch([{ domain, ownerKey, value }], options)
  // commitBatch는 entries 순서 그대로 각 값을 돌려준다(app-store.js) — 여기선 항상
  // 방금 넘긴 그 T값 하나뿐이라, 넓어진 DomainValue를 원래 T로 좁혀 돌려준다.
  return /** @type {T} */ (result)
}

/** @param {string} ownerKey @param {Record<string, DayRecordLike>} data 날짜별 운행 기록 @param {{ syncToCloud?: boolean }} [options] */
export function commitWorkData(ownerKey, data, options = {}) {
  return commit('workData', ownerKey, data, options)
}

/** @param {string} ownerKey @param {Array<CarLike>} cars @param {{ syncToCloud?: boolean }} [options] */
export function commitCars(ownerKey, cars, options = {}) {
  return commit('cars', ownerKey, cars, options)
}

/** @param {string} ownerKey @param {Array<ClientLike>} clients @param {{ syncToCloud?: boolean }} [options] */
export function commitClients(ownerKey, clients, options = {}) {
  return commit('clients', ownerKey, clients, options)
}

/** @param {string} ownerKey @param {FinanceSettings} settings 이미 normalizeSettings를 거친 값 @param {{ syncToCloud?: boolean }} [options] */
export function commitSettings(ownerKey, settings, options = {}) {
  return commit('settings', ownerKey, settings, options)
}

/** @param {string} ownerKey @param {Array<ExpenseItem>} items @param {{ syncToCloud?: boolean }} [options] */
export function commitExpenses(ownerKey, items, options = {}) {
  return commit('expenses', ownerKey, items, options)
}

/** @param {string} ownerKey @param {Array<InvoiceLike>} items @param {{ syncToCloud?: boolean }} [options] */
export function commitInvoices(ownerKey, items, options = {}) {
  return commit('invoices', ownerKey, items, options)
}

/** @param {string} ownerKey @param {Array<DriverRecord>} items @param {{ syncToCloud?: boolean }} [options] */
export function commitDrivers(ownerKey, items, options = {}) {
  return commit('drivers', ownerKey, items, options)
}

/** @param {string} ownerKey @param {ProfileLike} profile 이미 emptyProfile과 병합된 값 @param {{ syncToCloud?: boolean }} [options] */
export function commitProfile(ownerKey, profile, options = {}) {
  return commit('profile', ownerKey, profile, options)
}

/**
 * 무시한 알림 id 목록. 바닐라/클라우드 계약(KEYS)에 없는 로컬 전용 값이라
 * 클라우드 동기화는 예약하지 않는다(기존 dismissNotification과 동일한 동작이라
 * syncToCloud 오버라이드를 허용하지 않는다).
 * @param {string} ownerKey
 * @param {Array<string>} ids
 * @returns {Array<string>}
 */
export function commitDismissedNotifications(ownerKey, ids) {
  return commit('dismissedNotifications', ownerKey, ids, { syncToCloud: false })
}

/**
 * 재감사 3차(FAIL 지적 1번) — "아직 서버에 못 알린 빈 날 삭제" 목록(domain/
 * workDataTombstones.js). lib/workData.js가 workData 삭제와 같은 commitBatch
 * 호출에 이 도메인을 같이 넣어서(원자적) 로컬 삭제+tombstone 기록을 한 트랜잭션으로
 * 묶는다. lib/syncDeletedWorkDates.js는 원격 삭제가 성공한 날짜만 이 함수로(단독,
 * syncToCloud:false) 지운다.
 * @param {string} ownerKey @param {import('../domain/workDataTombstones.js').WorkDataTombstones} tombstones @param {{ syncToCloud?: boolean }} [options]
 */
export function commitWorkDataDeletedDates(ownerKey, tombstones, options = {}) {
  return commit('workDataDeletedDates', ownerKey, tombstones, options)
}
