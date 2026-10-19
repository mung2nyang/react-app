// @ts-check
// commitBatch가 쓸 localStorage { key, value } 목록을 계산하는 순수 함수(도메인 값).
// 로그인 세션은 서버가 정본이라 업무 도메인(CLOUD_MEMORY_ONLY_DOMAINS)을 LS에 쓰지 않는다. settings는 theme만 남긴다.
import { storageKeyFor } from './persist.js'

/**
 * @typedef {Object} BatchEntry
 * @property {import('./persist.js').PersistDomain} domain
 * @property {string} ownerKey
 * @property {import('./app-store.js').DomainValue} value
 */

/**
 * 로그인 사용자에게 localStorage 미러를 두지 않는 업무 도메인.
 * dismissedNotifications는 여기 없다. settings는 theme만 별도 persist.
 * @type {ReadonlySet<string>}
 */
export const CLOUD_MEMORY_ONLY_DOMAINS = new Set([
  'cars', 'clients', 'drivers', 'workData', 'expenses', 'invoices', 'profile', 'workDataDeletedDates',
])

/**
 * @param {string} domain @param {string} ownerKey @param {string|null} cloudOwnerKey
 */
export function isCloudMemoryOnly(domain, ownerKey, cloudOwnerKey) {
  return cloudOwnerKey != null && ownerKey === cloudOwnerKey && CLOUD_MEMORY_ONLY_DOMAINS.has(domain)
}

/**
 * @param {Array<BatchEntry>} entries
 * @param {{ persist: boolean, cloudOwnerKey?: string|null }} options
 * @returns {Array<import('./atomicPersist.js').KeyedWrite>}
 */
export function buildBatchWrites(entries, { persist, cloudOwnerKey = null }) {
  /** @type {Array<import('./atomicPersist.js').KeyedWrite>} */
  const writes = []
  if (persist) {
    entries.forEach(({ domain, ownerKey, value }) => {
      if (isCloudMemoryOnly(domain, ownerKey, cloudOwnerKey)) return
      if (cloudOwnerKey != null && ownerKey === cloudOwnerKey && domain === 'settings') {
        const theme = value && typeof value === 'object' && 'theme' in value && value.theme === 'dark' ? 'dark' : 'light'
        writes.push({ key: storageKeyFor(domain, ownerKey), value: { theme } })
        return
      }
      writes.push({ key: storageKeyFor(domain, ownerKey), value })
    })
  }
  return writes
}
