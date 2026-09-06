// @ts-check
/**
 * @param {Object} props
 * @param {string} [props.title]
 * @param {string} props.message
 * @param {() => void} props.onCancel
 * @param {() => void} props.onConfirm
 */
export default function ConfirmModal({ title = '경고', message, onCancel, onConfirm }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <p className="confirm-modal-text">{message}</p>
        <div className="modal-btns">
          <button type="button" className="modal-btn cancel" onClick={onCancel}>취소</button>
          <button type="button" className="modal-btn confirm" onClick={onConfirm}>확인</button>
        </div>
      </div>
    </div>
  )
}
