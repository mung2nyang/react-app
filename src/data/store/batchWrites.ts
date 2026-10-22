// commitBatch가 쓸 localStorage { key, value } 목록을 계산하는 순수 함수(도메인 값).
// 로그인 세션은 서버가 정본이라 업무 도메인(CLOUD_MEMORY_ONLY_DOMAINS)을 LS에 쓰지 않는다. settings는 theme만 남긴다.
import { storageKeyFor } from './persist.ts'
import type { PersistDomain } from './persist.ts'
import type { DomainValue } from './app-store.ts'
import type { KeyedWrite } from './atomicPersist.ts'

export type BatchEntry = {
  domain: PersistDomain
  ownerKey: string
  value: DomainValue
}

/**
 * 로그인 사용자에게 localStorage 미러를 두지 않는 업무 도메인.
 * dismissedNotifications는 여기 없다. settings는 theme만 별도 persist.
 */
export const CLOUD_MEMORY_ONLY_DOMAINS: ReadonlySet<string> = new Set([
  'cars', 'clients', 'drivers', 'workData', 'expenses', 'invoices', 'profile', 'workDataDeletedDates',
])

export function isCloudMemoryOnly(domain: string, ownerKey: string, cloudOwnerKey: string | null) {
  return cloudOwnerKey != null && ownerKey === cloudOwnerKey && CLOUD_MEMORY_ONLY_DOMAINS.has(domain)
}

export function buildBatchWrites(entries: Array<BatchEntry>, { persist, cloudOwnerKey = null }: { persist: boolean, cloudOwnerKey?: string | null }): Array<KeyedWrite> {
  const writes: Array<KeyedWrite> = []
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
