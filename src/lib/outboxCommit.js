// @ts-check
// 로컬 전용 커밋 — 저장 실패해도 예외를 던지지 않고 결과(문구·실패 여부)로 돌려준다.
/** @typedef {import('../store/persist.js').PersistDomain} PersistDomain */
/** @typedef {import('../store/app-store.js').DomainValue} DomainValue */
import { commitBatch } from '../store/app-store.js'

export const STORAGE_FAIL_TOAST = '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.'

/**
 * 로컬 전용(supabaseId 없음) 도메인 변경 — outbox 없이 commitBatch만 거친다.
 * @template {DomainValue} T
 * @param {{ domain: PersistDomain, ownerKey: string, value: T, successToast: string, extraWrites?: Array<import('../store/atomicPersist.js').KeyedWrite>, replaceWorkLogs?: import('../store/app-store.js').WorkLogsReplace }} params
 * @returns {{ value: T, toast: string, failed: false } | { value: undefined, toast: string, failed: true }}
 */
export function commitLocalOnly({ domain, ownerKey, value, successToast, extraWrites = [], replaceWorkLogs }) {
  try {
    commitBatch([{ domain, ownerKey, value }], { extraWrites, replaceWorkLogs })
    return { value, toast: successToast, failed: false }
  } catch (error) {
    console.error(`[outboxCommit] ${domain} 로컬 저장 실패:`, error)
    return { value: undefined, toast: STORAGE_FAIL_TOAST, failed: true }
  }
}
