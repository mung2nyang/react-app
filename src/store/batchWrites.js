// Step 0-4 감사 보완 3차: commitBatch가 실제로 쓸 localStorage { key, value } 목록을
// 계산하는 순수 함수. app-store.js에서 분리한 이유는 (1) 200줄 제한, (2) 도메인 값과
// dirty journal 값을 "하나의 쓰기 목록"으로 합치는 이 계산 자체를 store 오케스트레이션
// (state 반영/notify/schedule)과 분리해서 독립적으로 테스트하기 위해서다.
//
// 슬라이스 E(2026-09-01): 로그인 세션에서는 업무 도메인을 localStorage에 미러하지
// 않고 dirty journal로 동기화를 예약하지도 않는다(서버가 정본, 저장은 서버 직접 1회).
// 아래 CLOUD_MEMORY_ONLY_DOMAINS가 그 owner일 때 persist·dirty 쓰기에서 빠진다.
// 게스트(cloudOwnerKey null)는 예전과 100% 동일하다.
//
// 로그인 업무 도메인은 persist·dirty에서 뺀다. settings는 아래 persist 분기에서
// theme만 LS에 남긴다.
import { storageKeyFor } from './persist.js'
import { planDirtyWrite } from '../lib/dirtyJournal.js'

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
 * @param {Array<BatchEntry>} entries @param {string|null} cloudOwnerKey
 * @returns {boolean} entries가 모두 로그인 메모리 전용 업무 도메인이면 true(있어야).
 */
export function allEntriesCloudMemoryOnly(entries, cloudOwnerKey) {
  return entries.length > 0 && entries.every((entry) => isCloudMemoryOnly(entry.domain, entry.ownerKey, cloudOwnerKey))
}

/**
 * @param {Array<BatchEntry>} entries
 * @param {{ persist: boolean, syncToCloud: boolean, cloudOwnerKey?: string|null }} options
 * @returns {Array<import('./atomicPersist.js').KeyedWrite>}
 */
export function buildBatchWrites(entries, { persist, syncToCloud, cloudOwnerKey = null }) {
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
  if (syncToCloud && entries.length) {
    // 이론상 한 배치에 여러 ownerKey가 섞일 수 있다고 가정하고 owner별로 묶는다
    // (실제로는 항상 단일 owner지만, 여기서 미리 단정하지 않는다).
    const domainsByOwner = new Map()
    entries.forEach(({ domain, ownerKey }) => {
      if (isCloudMemoryOnly(domain, ownerKey, cloudOwnerKey)) return
      if (cloudOwnerKey != null && ownerKey === cloudOwnerKey && domain === 'settings') return
      if (!domainsByOwner.has(ownerKey)) domainsByOwner.set(ownerKey, [])
      domainsByOwner.get(ownerKey).push(domain)
    })
    domainsByOwner.forEach((domains, ownerKey) => {
      if (domains.length) writes.push(planDirtyWrite(ownerKey, domains))
    })
  }
  return writes
}
