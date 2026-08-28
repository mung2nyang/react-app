// @ts-check
import AutoSaveStatus from './AutoSaveStatus.jsx'

/**
 * @param {Object} props
 * @param {number} props.month
 * @param {number} props.day
 * @param {'idle'|'pending'|'saved'|'failed'} props.autoSaveStatus
 * @param {() => void} props.onClose
 */
export default function DayLogHeader({ month, day, autoSaveStatus, onClose }) {
  return (
    <div className="settings-header">
      <button type="button" className="icon-btn" title="뒤로가기" onClick={onClose}>
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>
      <div className="modal-title-stack">
        <div className="settings-title">{month}월 {day}일 운행 일지</div>
        <AutoSaveStatus status={autoSaveStatus} />
      </div>
      <div style={{ width: 40 }}></div>
    </div>
  )
}
