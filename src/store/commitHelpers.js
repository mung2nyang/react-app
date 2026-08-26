// Step 1~4 스토어 껍데기: commitBatch를 감싸는 단일 도메인 편의 함수들. app-store.js에서
// 분리한 이유는 200줄 제한 — 로직은 전혀 없고 전부 commitBatch([{ domain, ... }])의
// 얇은 래퍼다.
import { commitBatch } from './app-store.js'

/**
 * @template T
 * @param {import('./persist.js').PersistDomain} domain
 * @param {string} ownerKey
 * @param {T} value
 * @param {{ syncToCloud?: boolean }} [options]
 * @returns {T}
 */
function commit(domain, ownerKey, value, options = {}) {
  const [result] = commitBatch([{ domain, ownerKey, value }], options)
  return result
}

/** @param {string} ownerKey @param {object} data 날짜별 운행 기록 @param {{ syncToCloud?: boolean }} [options] */
export function commitWorkData(ownerKey, data, options = {}) {
  return commit('workData', ownerKey, data, options)
}

/** @param {string} ownerKey @param {Array<object>} cars @param {{ syncToCloud?: boolean }} [options] */
export function commitCars(ownerKey, cars, options = {}) {
  return commit('cars', ownerKey, cars, options)
}

/** @param {string} ownerKey @param {Array<object>} clients @param {{ syncToCloud?: boolean }} [options] */
export function commitClients(ownerKey, clients, options = {}) {
  return commit('clients', ownerKey, clients, options)
}

/** @param {string} ownerKey @param {object} settings 이미 normalizeSettings를 거친 값 @param {{ syncToCloud?: boolean }} [options] */
export function commitSettings(ownerKey, settings, options = {}) {
  return commit('settings', ownerKey, settings, options)
}

/** @param {string} ownerKey @param {Array<object>} items @param {{ syncToCloud?: boolean }} [options] */
export function commitExpenses(ownerKey, items, options = {}) {
  return commit('expenses', ownerKey, items, options)
}

/** @param {string} ownerKey @param {Array<object>} items @param {{ syncToCloud?: boolean }} [options] */
export function commitInvoices(ownerKey, items, options = {}) {
  return commit('invoices', ownerKey, items, options)
}

/** @param {string} ownerKey @param {Array<object>} items @param {{ syncToCloud?: boolean }} [options] */
export function commitDrivers(ownerKey, items, options = {}) {
  return commit('drivers', ownerKey, items, options)
}

/** @param {string} ownerKey @param {object} profile 이미 emptyProfile과 병합된 값 @param {{ syncToCloud?: boolean }} [options] */
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
