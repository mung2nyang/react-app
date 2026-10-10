// @ts-check
// useDayDraft.js의 자동 저장 상태 표시. 실패하면 토스트가 사라진 뒤에도 "아직 저장 안 됨"을 계속 보여 준다.
const LABEL = { idle: ' ', pending: '저장 중…', saved: '저장 완료', failed: '저장 실패' }

/** @param {{ status: 'idle'|'pending'|'saved'|'failed' }} props */
export default function AutoSaveStatus({ status }) {
  return <div className={`autosave-status visible${status === 'failed' ? ' autosave-status-failed' : ''}`}>{LABEL[status] || LABEL.idle}</div>
}
