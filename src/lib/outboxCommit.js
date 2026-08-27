// @ts-check
// Step 0-4 감사 보완 4차(+재작업): directMutationActions.js에서 분리한 공용 커밋
// 프리미티브(200줄 제한) — "로컬만" 커밋하는 경로와 "도메인+outbox를 원자적으로
// 커밋한 뒤 즉시 flush를 시도"하는 경로, 두 가지를 각 액션 함수가 공유한다.
//
// 실패 방어(사용자 지시 10번): 로컬 저장(writeAllOrNothing/commitBatch)이 실패해도
// 절대 예외를 위로 던지지 않는다 — 호출부(컴포넌트의 onClick 핸들러)는 반환값을
// await만 할 뿐 catch하지 않으므로, 여기서 던지면 unhandled promise rejection이 되고
// 사용자는 아무 피드백도 못 받는다.
//
// 명시적 결과(4차 재작업 사용자 지시 1번): "outbox에 아직 남아 있는지"를 보고
// 성공 여부를 추론하지 않는다 — flushMutationOutbox가 돌려주는 Map에서 이 op의
// 결과(OUTBOX_RESULT)를 직접 찾아 그 값으로만 판단한다. 맵에 없으면(다른 owner의
// 실행이 우리 op에 도달하기 전에 멈췄거나 하는 극단적 경우) "아직 대기 중"으로
// 안전하게 취급한다 — 실패로 단정하지 않는다.
/** @typedef {import('../store/persist.js').PersistDomain} PersistDomain */
/** @typedef {import('../store/app-store.js').DomainValue} DomainValue */
/** @typedef {import('./outboxTypes.js').OutboxOp} OutboxOp */
/** @typedef {import('./mutationOutbox.js').OutboxResultStatus} OutboxResultStatus */
import { storageKeyFor } from '../store/persist.js'
import { writeAllOrNothing } from '../store/atomicPersist.js'
import { commitBatch } from '../store/app-store.js'
import { OUTBOX_RESULT, planOutboxAppend } from './mutationOutbox.js'
import { flushMutationOutbox } from './outboxFlush.js'

export const STORAGE_FAIL_TOAST = '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.'

/**
 * 로컬 전용(supabaseId 없음) 도메인 변경 — outbox 없이 commitBatch만 거친다.
 * @param {{ domain: PersistDomain, ownerKey: string, value: DomainValue, successToast: string }} params
 */
export function commitLocalOnly({ domain, ownerKey, value, successToast }) {
  try {
    commitBatch([{ domain, ownerKey, value }], {})
    return { value, toast: successToast, failed: false }
  } catch (error) {
    console.error(`[outboxCommit] ${domain} 로컬 저장 실패:`, error)
    return { value: undefined, toast: STORAGE_FAIL_TOAST, failed: true }
  }
}

/**
 * @param {{ domain: PersistDomain, ownerKey: string, domainValue: DomainValue, op: OutboxOp,
 *   successToast: string, pendingToast: string, failureToast?: string }} params
 *   failureToast: permanentFailure일 때 보여줄 문구. 생략하면 실제 실패 사유
 *   (error.message)를 그대로 쓰고, 그것도 없으면 pendingToast로 대체한다.
 * @returns {Promise<{ status: OutboxResultStatus|null, succeeded: boolean, toast: string,
 *   storageFailed: boolean }>}
 */
export async function commitWithOutboxAndFlush({ domain, ownerKey, domainValue, op, successToast, pendingToast, failureToast }) {
  // 재감사 1번: driverLink/upsert가 확정 전에 여러 번 편집되면 mergeOutboxOp가
  // 최초 op의 id를 그대로 이어받을 수 있다(mergeDriverUpsert) — 그러면 이번에
  // 새로 만든 op.id로 flush 결과를 찾아도 못 찾는다. 항상 effectiveOp.id로 찾는다.
  let effectiveOpId = op.id
  try {
    const domainKey = storageKeyFor(domain, ownerKey)
    const { key: outboxKey, value: nextOps, effectiveOp } = planOutboxAppend(ownerKey, op)
    effectiveOpId = effectiveOp.id
    // DomainValue(object|Array<object>|Array<string>)는 실제로 항상 JSON 직렬화
    // 가능한 순수 데이터라 JsonValue와 값 수준에서는 같지만, object의 속성 타입까지
    // TS가 구조적으로 검증할 수는 없다 — 여기서 그 사실을 명시적으로 단언한다.
    const jsonDomainValue = /** @type {import('../store/atomicPersist.js').JsonValue} */ (domainValue)
    writeAllOrNothing([{ key: domainKey, value: jsonDomainValue }, { key: outboxKey, value: nextOps }])
    commitBatch([{ domain, ownerKey, value: domainValue }], { persist: false, syncToCloud: false })
  } catch (error) {
    console.error(`[outboxCommit] ${domain}+outbox 원자적 저장 실패:`, error)
    return { status: null, succeeded: false, toast: STORAGE_FAIL_TOAST, storageFailed: true }
  }

  const resultMap = await flushMutationOutbox(ownerKey).catch((error) => {
    console.error('outbox 플러시 실패:', error)
    return /** @type {Map<string, { status: OutboxResultStatus, message?: string }>} */ (new Map())
  })
  // 맵에서 못 찾으면(세션이 바뀌어 우리 op까지 못 갔거나, 다른 owner의 실행이었던
  // 경우 등) 실패로 단정하지 않고 "아직 대기 중"으로 본다 — outbox엔 여전히
  // 남아 있으므로 다음 flush가 이어서 시도한다.
  const { status = OUTBOX_RESULT.RETRYABLE, message } = resultMap.get(effectiveOpId) || {}
  const toast = status === OUTBOX_RESULT.SUCCESS
    ? successToast
    : status === OUTBOX_RESULT.PERMANENT_FAILURE
      ? (failureToast || message || pendingToast)
      : pendingToast // retryable/staleSession 둘 다 "아직 확정 안 됨" — 실패로 단정하지 않는다.
  return { status, succeeded: status === OUTBOX_RESULT.SUCCESS, toast, storageFailed: false }
}
