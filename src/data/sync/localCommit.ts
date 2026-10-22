// 기기 저장만 하는 커밋 — 저장 실패해도 예외를 던지지 않고 결과(문구·실패 여부)로 돌려준다.
import type { PersistDomain } from '../store/persist.ts'
import type { DomainValue, WorkLogsReplace } from '../store/app-store.ts'
import type { KeyedWrite } from '../store/atomicPersist.ts'
import { commitBatch } from '../store/app-store.ts'
import { DEVICE_SAVE_FAIL } from '../../shared/utils/failureMessages.js'

export const STORAGE_FAIL_TOAST = DEVICE_SAVE_FAIL

/** 로컬 전용(supabaseId 없음) 도메인 변경 — outbox 없이 commitBatch만 거친다. */
export function commitLocalOnly<T extends DomainValue>({ domain, ownerKey, value, successToast, extraWrites = [], replaceWorkLogs }: { domain: PersistDomain, ownerKey: string, value: T, successToast: string, extraWrites?: Array<KeyedWrite>, replaceWorkLogs?: WorkLogsReplace }): { value: T, toast: string, failed: false } | { value: undefined, toast: string, failed: true } {
  try {
    commitBatch([{ domain, ownerKey, value }], { extraWrites, replaceWorkLogs })
    return { value, toast: successToast, failed: false }
  } catch (error) {
    console.error(`[localCommit] ${domain} 로컬 저장 실패:`, error)
    return { value: undefined, toast: STORAGE_FAIL_TOAST, failed: true }
  }
}
