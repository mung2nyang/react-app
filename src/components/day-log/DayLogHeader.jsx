// @ts-check
import AutoSaveStatus from './AutoSaveStatus.jsx'

/**
 * @param {Object} props
 * @param {number} props.month
 * @param {number} props.day
 * @param {'idle'|'pending'|'saved'|'failed'} props.autoSaveStatus
 * @param {() => void} props.onClose
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function DayLogHeader({ month, day, autoSaveStatus, onClose, onOpenMenu }) {
  return (
    <div className="settings-header">
      <button type="button" className="icon-btn" title="뒤로가기" onClick={onClose}>
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>
      <div className="modal-title-stack">
        <div className="settings-title">{month}월 {day}일 운행 일지</div>
        <AutoSaveStatus status={autoSaveStatus} />
      </div>
      {onOpenMenu ? (
        <button type="button" className="icon-btn top-menu-btn" title="메뉴" onClick={onOpenMenu}>
          <svg viewBox="0 0 24 24">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      ) : <div style={{ width: 40 }}></div>}
    </div>
  )
}
