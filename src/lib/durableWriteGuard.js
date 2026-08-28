// @ts-check
// 재감사 4차(FAIL 지적 2번) — 이전 버전은 registerPendingDayWrite/clearPendingDayWrite가
// 부를 때마다 이 모듈의 전역 boolean 하나를 true/false로 세팅했다. owner A의 fallback
// 항목이 아직 남아 있는 동안 owner B의 durable 쓰기가 (그 이후에) 성공하면, B가 부른
// markDurableWriteHealthy()가 A의 위험을 지워 버리는 결함이 있었다(마지막으로 호출된
// 쪽이 "전체" 상태를 결정 — 실측 확인). 이 모듈은 이제 자체 상태를 전혀 갖지 않는다 —
// pendingWorkDataWrites.js가 소유한 fallback(durable 기록에 실패해 메모리에만 남은
// 패치들)이 하나라도 있으면 그 자체로 "지금 안전하지 않다"는 뜻이므로, 매번 그 존재
// 여부를 직접 물어본다(fallback.size > 0). 항목 하나가 성공적으로 처리돼도 다른
// owner/date의 fallback이 남아 있으면 이 질의는 계속 true를 돌려준다.
import { hasUnsafePendingWrites } from './pendingWorkDataWrites.js'

/** @typedef {import('./pendingWorkDataWritesTypes.js').EffectivePatch} EffectivePatch */

// 재감사 10차(FAIL 지적 2번) — registerPendingDayWrite가 dateKey/patch 계약 위반으로
// 접수 자체를 거부하면(정상 동작에서는 절대 안 일어나지만, useDayDraft.js가 그
// 반환값을 무시하면 안 된다는 방어적 요구), 그 최신 draft는 durable에도 fallback에도
// 전혀 안 남는다. 조용히 잃어버리는 대신 이 guard 전용 메모리에 남겨서, 데이터
// 자체는 여전히 못 구해도 최소한 beforeunload/전역 이동 방어는 계속 살아있게 한다.
const KEY_SEP = String.fromCharCode(0)
/** @type {Map<string, EffectivePatch>} */
const unsafeUnregistered = new Map()

/** @param {string} ownerKey @param {string} dateKey @param {EffectivePatch} patch */
export function markUnsafeRegistrationFailure(ownerKey, dateKey, patch) {
  unsafeUnregistered.set(`${ownerKey}${KEY_SEP}${dateKey}`, patch)
}

/** @param {string} ownerKey @param {string} dateKey */
export function clearUnsafeRegistrationFailure(ownerKey, dateKey) {
  unsafeUnregistered.delete(`${ownerKey}${KEY_SEP}${dateKey}`)
}

export function isDurableWriteBroken() {
  return hasUnsafePendingWrites() || unsafeUnregistered.size > 0
}

/**
 * 탭 닫기/새로고침을 막는다(브라우저 네이티브 확인창). durable 기록이 막혀 있을
 * 때만 실제로 preventDefault를 부른다 — 평소엔 완전히 투명하다. returnValue는
 * BeforeUnloadEvent 표준상 boolean이다(문자열을 넣던 옛 관례는 최신 브라우저에서
 * 무시된다).
 * @param {{ preventDefault: () => void, returnValue?: boolean }} event
 */
export function guardBeforeUnload(event) {
  if (!isDurableWriteBroken()) return
  event.preventDefault()
  event.returnValue = true
}

/**
 * 화면 안에서의 이동(뒤로가기 등) 직전에 부른다. durable 기록이 정상이면 항상
 * true(그냥 이동). 막혀 있으면 confirm으로 사용자에게 알리고, 사용자가 "그래도
 * 이동"을 선택했을 때만 true를 돌려준다 — react-router가 데이터 라우터가 아니라서
 * (main.jsx는 `<BrowserRouter>`) useBlocker를 쓸 수 없어, 이동을 시작하는 각 호출부
 * (DayLogPage.jsx의 뒤로가기 등)가 이 함수로 먼저 확인한다.
 * @returns {boolean} true면 이동을 진행해도 된다.
 */
export function confirmLeaveIfUnsafe() {
  if (!isDurableWriteBroken()) return true
  return window.confirm('마지막 편집을 아직 안전하게 저장하지 못했습니다. 그래도 나가시겠습니까?')
}
