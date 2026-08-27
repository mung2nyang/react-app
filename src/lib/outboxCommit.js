// Step 0-4 감사 보완 4차(+재작업): directMutationActions.js에서 분리한 공용 커밋
// 프리미티브(200줄 제한) — "로컬만" 커밋하는 경로와 "도메인+outbox를 원자적으로
// 커밋한 뒤 즉시 flush를 시도"하는 경로, 두 가지를 각 액션 함수가 공유한다.
//
// 실패 방어(사용자 지시 10번): 로컬 저장(writeAllOrNothing/commitBatch)이 실패해도
// 절대 예외를 위로 던지지 않는다 — 호출부(컴포넌트의 onClick 핸들러)는 반환값을
// await만 할 뿐 catch하지 않으므로, 여기서 던지면 unhandled promise rejection이 되고
// 사용자는 아무 피드백도 못 받는다.
import { storageKeyFor } from '../store/persist.js'
import { writeAllOrNothing } from '../store/atomicPersist.js'
import { commitBatch } from '../store/app-store.js'
import { getPendingOps, planOutboxAppend } from './mutationOutbox.js'
import { flushMutationOutbox } from './outboxFlush.js'

export const STORAGE_FAIL_TOAST = '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.'

/** 로컬 전용(supabaseId 없음) 도메인 변경 — outbox 없이 commitBatch만 거친다. */
export function commitLocalOnly({ domain, ownerKey, value, successToast }) {
  try {
    commitBatch([{ domain, ownerKey, value }], {})
    return { value, toast: successToast, failed: false }
  } catch (error) {
    console.error(`[outboxCommit] ${domain} 로컬 저장 실패:`, error)
    return { value: undefined, toast: STORAGE_FAIL_TOAST, failed: true }
  }
}

export async function commitWithOutboxAndFlush({ domain, ownerKey, domainValue, op, successToast, pendingToast }) {
  try {
    const domainKey = storageKeyFor(domain, ownerKey)
    const { key: outboxKey, value: nextOps } = planOutboxAppend(ownerKey, op)
    writeAllOrNothing([{ key: domainKey, value: domainValue }, { key: outboxKey, value: nextOps }])
    commitBatch([{ domain, ownerKey, value: domainValue }], { persist: false, syncToCloud: false })
  } catch (error) {
    console.error(`[outboxCommit] ${domain}+outbox 원자적 저장 실패:`, error)
    return { succeeded: false, toast: STORAGE_FAIL_TOAST, storageFailed: true }
  }

  await flushMutationOutbox(ownerKey).catch((error) => console.error('outbox 플러시 실패:', error))
  const stillPending = getPendingOps(ownerKey).some((pending) => pending.id === op.id)
  return { succeeded: !stillPending, toast: stillPending ? pendingToast : successToast, storageFailed: false }
}
