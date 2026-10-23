// @ts-check
// 일지 자동 저장 상태 — 제목 옆 작은 아이콘(저장 중·완료·실패). 실패는 아이콘이 남고 날짜를 넣은 알림 문구가 따로 뜬다.
const LABEL = { idle: '', pending: '저장 중', saved: '저장 완료', failed: '저장 실패' }

/** @param {{ status: 'idle'|'pending'|'saved'|'failed' }} props */
function StatusIcon({ status }) {
  if (status === 'pending') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" opacity="0.3"></circle>
        <path d="M12 3a9 9 0 0 1 9 9"></path>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9"></circle>
      {status === 'saved' ? <polyline points="8 12.5 11 15.5 16 9.5"></polyline> : <><line x1="12" y1="7.5" x2="12" y2="13"></line><line x1="12" y1="16.5" x2="12" y2="16.5"></line></>}
    </svg>
  )
}

/** @param {{ status: 'idle'|'pending'|'saved'|'failed' }} props */
export default function AutoSaveStatus({ status }) {
  const label = LABEL[status] || ''
  return (
    <div className={`autosave-status autosave-${status}${status === 'failed' ? ' autosave-status-failed' : ''}`} role="status">
      {label && <StatusIcon status={status} />}
      <span className="sr-only">{label}</span>
    </div>
  )
}
