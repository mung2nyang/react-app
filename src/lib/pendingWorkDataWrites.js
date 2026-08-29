// @ts-check
// durable(모듈 생애주기와 무관한) 실패-편집 큐. React 콜백(onSettled)은 직렬화 불가라
// durable엔 안 넣고 메모리 전용 Map에 둔다. 저수준 읽기/쓰기는 durableStorage.js,
// 타입은 pendingWorkDataWritesTypes.js가 정본. owner/date 스캔은
// pendingWorkDataWritesState.js.
import { isValidCalendarDateKey } from '../domain/dateKey.js'
import { saveDayRecord } from '../domain/day-record.js'
import { readOwnerWorkData } from '../store/ownerDataHooks.js'
import { readDurable, writeDurable } from './durableStorage.js'
import { isValidPatch } from './durablePatchSchema.js'
import { pulsePendingRetry } from './pendingRetryPulse.js'
import { saveWorkDataWithTombstoneCheck } from './workData.js'
import {
  computeEffectivePendingEntries, fallback, keyOf, settledCallbacks,
} from './pendingWorkDataWritesState.js'

/** @typedef {import('./pendingWorkDataWritesTypes.js').EffectivePatch} EffectivePatch */

/**
 * 재감사 9차 — durable/fallback/callback을 건드리기 전에 dateKey/patch를 readDurable과
 * 같은 정본 검증기로 확인한다. 잘못됐으면 아무 것도 안 건드리고 `false`를 돌려준다.
 * @param {string} ownerKey
 * @param {string} dateKey
 * @param {EffectivePatch} patch
 * @param {(ok: boolean) => void} [onSettled]
 * @returns {boolean} true면 접수됨(durable 또는 fallback), false면 계약 위반으로 무시됨.
 */
export function registerPendingDayWrite(ownerKey, dateKey, patch, onSettled) {
  if (!isValidCalendarDateKey(dateKey) || !isValidPatch(patch)) return false
  try {
    if (onSettled) settledCallbacks.set(keyOf(ownerKey, dateKey), onSettled)
    const current = readDurable(ownerKey)
    if (!current.ok) {
      fallback.set(keyOf(ownerKey, dateKey), patch)
      return true
    }
    try {
      const next = { ...current.value, [dateKey]: patch }
      writeDurable(ownerKey, next)
      fallback.delete(keyOf(ownerKey, dateKey))
    } catch {
      fallback.set(keyOf(ownerKey, dateKey), patch)
    }
    return true
  } finally {
    pulsePendingRetry()
  }
}

/**
 * store 커밋이 이미 성공한 뒤 이 함수가 durable 큐에서 그 항목을 정리한다. durable을
 * 못 읽거나(재감사 6차) 지우는 쓰기가 실패하면(재감사 5차) fallback을 지우는 대신
 * effectivePatch로 다시 채운다 — "fallback이 durable을 덮어쓴다" 규칙 덕분에 다음
 * 조회/재시도가 stale 값이 아니라 이 값을 본다. callback은 반환값을 본 호출부가
 * "논리적 pending이 실제로 정리됐을 때만" 부른다.
 * @param {string} ownerKey
 * @param {string} dateKey
 * @param {EffectivePatch} effectivePatch 방금 store에 성공적으로 커밋한 값.
 * @returns {boolean} true면 완전히 정리됐다. false면 못 읽었거나 못 지워 residual로 남았다.
 */
export function clearPendingDayWrite(ownerKey, dateKey, effectivePatch) {
  try {
    const current = readDurable(ownerKey)
    if (!current.ok) {
      fallback.set(keyOf(ownerKey, dateKey), effectivePatch)
      return false
    }
    const next = current.value
    const hadDurableEntry = dateKey in next
    let durableCleanupOk = true
    if (hadDurableEntry) {
      delete next[dateKey]
      try {
        writeDurable(ownerKey, next)
      } catch {
        durableCleanupOk = false
      }
    }
    if (!durableCleanupOk) {
      fallback.set(keyOf(ownerKey, dateKey), effectivePatch)
      return false
    }
    fallback.delete(keyOf(ownerKey, dateKey))
    settledCallbacks.delete(keyOf(ownerKey, dateKey))
    return true
  } finally {
    pulsePendingRetry()
  }
}

/**
 * 재진입(같은 owner/date로 새 컴포넌트 인스턴스가 뜰 때) 시 store 값 위에
 * 덮어씌울 pending patch. useDayDraft.js가 초기 draft를 만들기 직전에 부른다.
 * @param {string} ownerKey @param {string} dateKey @returns {EffectivePatch|undefined}
 */
export function getPendingDayWrite(ownerKey, dateKey) {
  const fromFallback = fallback.get(keyOf(ownerKey, dateKey))
  if (fromFallback) return fromFallback
  const current = readDurable(ownerKey)
  return current.ok ? current.value[dateKey] : undefined
}

// durableWriteGuard.js가 "지금 나가면 조용히 유실될 편집이 있는가"를 판단하는 근거.
// fallback에 항목이 있거나, 어떤 owner의(또는 owner 목록 자체를) 읽을 수 없으면
// "안전하다"고 거짓 판정하지 않는다.
export function hasUnsafePendingWrites() {
  if (fallback.size > 0) return true
  const { unreadableOwners, ownerEnumerationFailed } = computeEffectivePendingEntries()
  return ownerEnumerationFailed || unreadableOwners.size > 0
}

// 읽지 못한 owner가 있거나(재감사 6차) owner 열거 자체가 실패했으면(재감사 7차)
// entries가 0이어도 "pending 없음"으로 거짓 판정하지 않는다.
export function hasPendingDayWrites() {
  const { entries, unreadableOwners, ownerEnumerationFailed } = computeEffectivePendingEntries()
  return entries.size > 0 || unreadableOwners.size > 0 || ownerEnumerationFailed
}

// 읽지 못한 owner라도 fallback을 통해 entries에 이미 반영돼 있으면(예: cleanup
// 실패 residual) 또 더하지 않는다(이중 계산 방지). entries에 전혀 안 잡힌 owner만
// +1. owner 열거 자체가 실패하면 그 존재를 아예 모르는 owner가 더 있을 수 있다는
// 뜻으로 추가로 +1한다.
export function pendingDayWriteCount() {
  const { entries, unreadableOwners, ownerEnumerationFailed } = computeEffectivePendingEntries()
  let count = entries.size
  if (unreadableOwners.size > 0) {
    const coveredOwners = new Set([...entries.values()].map((entry) => entry.ownerKey))
    unreadableOwners.forEach((ownerKey) => { if (!coveredOwners.has(ownerKey)) count += 1 })
  }
  if (ownerEnumerationFailed) count += 1
  return count
}

// 큐에 남은 모든 effective 항목을 한 번씩 재시도한다. 새로고침/탭 재시작 뒤 최초
// 호출도 이 함수 하나로 durable에서 그대로 복구된다. owner 열거 자체가 실패하면
// 아무 상태도 바꾸지 않고 종료한다(이 정도로 깨진 상황에서 부분 재시도는 위험하다).
export function retryPendingDayWrites() {
  const { entries, unreadableOwners, ownerEnumerationFailed } = computeEffectivePendingEntries()
  if (ownerEnumerationFailed) return

  entries.forEach(({ ownerKey, dateKey, patch }) => {
    // 이 owner의 durable을 못 읽었으면 fallback도 이번엔 통째로 건너뛴다(부분 커밋
    // 금지, 재감사 8차). 읽기가 복구되면 다음 호출에서 자연히 다시 포함된다.
    if (unreadableOwners.has(ownerKey)) return
    try {
      const latest = readOwnerWorkData(ownerKey)
      const next = saveDayRecord(latest, dateKey, patch)
      saveWorkDataWithTombstoneCheck(ownerKey, dateKey, latest, next)
      // durable에서도 진짜 지워졌을 때만 onSettled를 부른다 — 실패하면 다음 재시도의
      // 정리 성공 때 정확히 한 번 불린다.
      const onSettled = settledCallbacks.get(keyOf(ownerKey, dateKey))
      const cleared = clearPendingDayWrite(ownerKey, dateKey, patch)
      if (cleared) onSettled?.(true)
    } catch {
      // effective patch를 durable/fallback 어느 쪽에도 손대지 않는다.
    }
  })
}
