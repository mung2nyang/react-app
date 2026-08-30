// @ts-check
// Step 6(일지 재작성): migration-plan.md 1.3이 제안한 "DayDraft + editingCallId +
// inlinePanel"을 한 리듀서로 묶는다 — draft 필드 편집과 "콜상세 폼이 열려 있는지"는
// 서로 자주 함께 바뀌므로(예: 콜상세 저장 = draft.callDetails 갱신 + 폼 닫기, 한
// dispatch로 원자적으로 끝난다) 하나의 상태로 관리하는 게 맞다.
//
// 이 리듀서는 일부러 "다 계산된 값을 반영"만 한다 — 유효성 검사·결제 토글 같은
// domain 함수 호출·실패 토스트는 useDayDraft.js/DayLogPage.jsx에 남겨 뒀다(리듀서
// 안에서 실패해도 보여줄 곳이 없다 — 토스트는 부작용이라 리듀서에 넣을 수 없다).
// 비용(정비/주유/기타)은 이 draft에 없다 — day record가 아니라 별도 expenses
// 스토어에서 즉시 저장으로 계속 관리한다(WorkLogPage.jsx 시절과 동일 — 아래
// migration-audit-plan.md Step 6 기록의 "비용 계약" 항목 참고).
import { getCallDetails } from '../../domain/day-record.js'

/**
 * @typedef {Object} DayDraft
 * @property {boolean} isOff
 * @property {number} fixedCount
 * @property {number} palletCount
 * @property {Array<import('./dayLogTypes.js').CallDetailLike>} callDetails
 * @property {Record<string, number>} fixedRouteCounts
 */

/**
 * @typedef {Object} DayLogState
 * @property {DayDraft} draft
 * @property {string|null} editingCallId 콜상세 폼이 열려 있을 때만 의미 있음 — null이면 신규
 * @property {boolean} callFormOpen
 */

/**
 * record.callDetails의 모든 항목이 이미 id를 가진 상태여야 한다 — useDayDraft.js가
 * 마운트 시 domain/day-record.js의 backfillCallDetailIds로 레거시 항목을 미리
 * 영구 id로 채운 뒤에만 이 함수를 부른다(재감사 FAIL 지적 3번 — 예전엔 여기서
 * getCallDetails가 매번 `legacy-${index}` 임시 id를 새로 만들었는데, store에 반영되지
 * 않아 새로고침·삭제·재정렬마다 값이 흔들렸다. 지금은 이 함수가 id를 "만들지" 않고,
 * 이미 만들어져 들어온 값을 그대로 옮기기만 한다 — structuredClone으로 깊게
 * 복제해서 store 원본과 draft가 어떤 중첩 배열/객체도(payments, commissionSnapshot
 * 포함) 참조를 공유하지 않게 한다(재감사 FAIL 지적 8번 — 예전엔 각 콜상세 item만
 * 얕게 `{...item}` 복제해서, item 안의 payments 배열/commissionSnapshot 객체는
 * store 원본과 여전히 같은 참조였다 — 어딘가서 그 중첩 값을 제자리 수정하면
 * store까지 같이 바뀔 수 있는 잠재 버그였다).
 * @param {{ isOff?: boolean, fixedCount?: number|string, palletCount?: number|string, callDetails?: Array<import('../../domain/callDetail.js').CallDetailLike>, fixedRouteCounts?: Record<string, number> }} [record]
 * @returns {DayLogState}
 */
export function initDayLogState(record) {
  const off = !!record?.isOff
  return {
    draft: {
      isOff: off,
      fixedCount: off ? 0 : Math.max(0, parseInt(String(record?.fixedCount ?? 0), 10) || 0),
      palletCount: off ? 0 : Math.max(0, parseInt(String(record?.palletCount ?? 0), 10) || 0),
      // day-record.js의 CallDetailLike는 id가 optional이지만(도메인 레벨에서는 아직
      // id 없는 자리를 가리킬 수 있어서), 여기 도달하는 record는 useDayDraft.js가
      // backfillCallDetailIds로 이미 전부 id를 채운 뒤라 항상 있다 — 위 함수 docblock에
      // 적힌 계약을 타입으로도 명시한다(단언 하나, object/any 경유 아님).
      callDetails: /** @type {Array<import('./dayLogTypes.js').CallDetailLike>} */ (structuredClone(getCallDetails({ callDetails: record?.callDetails }))),
      fixedRouteCounts: structuredClone(record?.fixedRouteCounts || {}),
    },
    editingCallId: null,
    callFormOpen: false,
  }
}

/**
 * @typedef {{ type: 'patchDraft', patch: Partial<DayDraft> }
 *   | { type: 'openCallForm', id: string|null }
 *   | { type: 'closeCallForm' }} DayLogAction
 */

/**
 * @param {DayLogState} state
 * @param {DayLogAction} action
 * @returns {DayLogState}
 */
export function dayLogReducer(state, action) {
  switch (action.type) {
    case 'patchDraft':
      return { ...state, draft: { ...state.draft, ...action.patch } }
    case 'openCallForm':
      return { ...state, callFormOpen: true, editingCallId: action.id }
    case 'closeCallForm':
      return { ...state, callFormOpen: false, editingCallId: null }
    default:
      return state
  }
}
