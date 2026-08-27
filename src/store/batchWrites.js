// Step 0-4 감사 보완 3차: commitBatch가 실제로 쓸 localStorage { key, value } 목록을
// 계산하는 순수 함수. app-store.js에서 분리한 이유는 (1) 200줄 제한, (2) 도메인 값과
// dirty journal 값을 "하나의 쓰기 목록"으로 합치는 이 계산 자체를 store 오케스트레이션
// (state 반영/notify/schedule)과 분리해서 독립적으로 테스트하기 위해서다.
//
// 예전엔 markDirty()가 도메인 값 쓰기와 별도로 자기 localStorage.setItem을 호출했다 —
// 그 호출만 실패해도(용량 초과 등) "도메인은 새 값인데 journal은 갱신 안 됨" 같은
// 불일치가 생길 수 있었다. 이제 여기서 journal의 "다음 값"까지 미리(쓰기 없이) 계산해
// 도메인 값들과 같은 배열에 담아 두고, 호출부가 writeAllOrNothing 한 번으로 전부 쓴다.
import { storageKeyFor } from './persist.js'
import { planDirtyWrite } from '../lib/dirtyJournal.js'

/**
 * @typedef {Object} BatchEntry
 * @property {import('./persist.js').PersistDomain} domain
 * @property {string} ownerKey
 * @property {import('./app-store.js').DomainValue} value
 */

/**
 * @param {Array<BatchEntry>} entries
 * @param {{ persist: boolean, syncToCloud: boolean }} options
 * @returns {Array<import('./atomicPersist.js').KeyedWrite>}
 */
export function buildBatchWrites(entries, { persist, syncToCloud }) {
  const writes = []
  if (persist) {
    entries.forEach(({ domain, ownerKey, value }) => {
      writes.push({ key: storageKeyFor(domain, ownerKey), value })
    })
  }
  if (syncToCloud && entries.length) {
    // 이론상 한 배치에 여러 ownerKey가 섞일 수 있다고 가정하고 owner별로 묶는다
    // (실제로는 항상 단일 owner지만, 여기서 미리 단정하지 않는다).
    const domainsByOwner = new Map()
    entries.forEach(({ domain, ownerKey }) => {
      if (!domainsByOwner.has(ownerKey)) domainsByOwner.set(ownerKey, [])
      domainsByOwner.get(ownerKey).push(domain)
    })
    domainsByOwner.forEach((domains, ownerKey) => {
      writes.push(planDirtyWrite(ownerKey, domains))
    })
  }
  return writes
}
