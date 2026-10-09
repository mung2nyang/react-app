// @ts-check
import { useEffect, useId, useRef } from 'react'

/**
 * @param {Object} props
 * @param {string} [props.title]
 * @param {string} props.message
 * @param {() => void} props.onCancel
 * @param {() => void} props.onConfirm
 */
export default function ConfirmModal({ title = '경고', message, onCancel, onConfirm }) {
  const titleId = useId()
  const cancelRef = useRef(/** @type {HTMLButtonElement | null} */ (null))
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  // 열리면 "취소"에 키보드 위치, Esc로 닫기, 닫히면 원래 자리로 돌려놓기.
  useEffect(() => {
    const previous = /** @type {HTMLElement | null} */ (document.activeElement)
    cancelRef.current?.focus()
    /** @param {KeyboardEvent} event */
    function onKeyDown(event) {
      if (event.key === 'Escape') onCancelRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus?.()
    }
  }, [])

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" role="alertdialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <div className="modal-title" id={titleId}>{title}</div>
        <p className="confirm-modal-text">{message}</p>
        <div className="modal-btns">
          <button type="button" className="modal-btn cancel" ref={cancelRef} onClick={onCancel}>취소</button>
          <button type="button" className="modal-btn confirm" onClick={onConfirm}>확인</button>
        </div>
      </div>
    </div>
  )
}
