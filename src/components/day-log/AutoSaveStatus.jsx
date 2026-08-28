// @ts-check
// Step 6(일지 재작성): useDayDraft.js의 디바운스 상태를 화면에 보여준다. 예전
// WorkLogPage.jsx는 "입력하면 바로 저장됩니다"라는 고정 문구였다 — 이제 실제로
// 디바운스 후에 저장되므로(완료 조건), 문구도 실제 상태를 반영한다.
// 재감사(FAIL 지적 9번) — failed: 자동 저장이 실패(예: localStorage 용량 초과)했을 때.
// useDayDraft.js가 이미 실패 토스트를 따로 띄우지만, 토스트는 몇 초 뒤 사라지므로
// 이 상시 표시 문구로도 "아직 저장 안 됐다"는 걸 계속 알린다.
const LABEL = { idle: '입력하면 자동으로 저장됩니다', pending: '저장 중…', saved: '저장됨', failed: '저장 실패 — 저장 공간을 확인해 주세요' }

/** @param {{ status: 'idle'|'pending'|'saved'|'failed' }} props */
export default function AutoSaveStatus({ status }) {
  return <div className={`autosave-status visible${status === 'failed' ? ' autosave-status-failed' : ''}`}>{LABEL[status] || LABEL.idle}</div>
}
