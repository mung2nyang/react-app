// @ts-check
// 창(팝업) 공용 껍데기 — 바깥 누름·Esc 닫기, 겹친 창은 맨 위만 Esc, 열 때·닫을 때 키보드 위치(로드맵 57).
import { useEffect, useRef } from 'react'

/** 지금 열린 창 순서(맨 뒤가 맨 위). 메모리에만 있다. @type {Array<object>} */
const openShells = []

/**
 * @param {Object} props
 * @param {() => void} props.onClose
 * @param {boolean} [props.closeOnOverlay] 바깥(회색) 누르면 닫기(기본 켬)
 * @param {boolean} [props.closeOnEscape] Esc 키로 닫기(기본 켬)
 * @param {'dialog'|'alertdialog'} [props.role]
 * @param {string} [props.label] 화면 읽기용 창 이름
 * @param {string} [props.labelledBy] 창 이름이 적힌 요소 id
 * @param {string} [props.contentClassName] 안쪽 상자 CSS 이름(기본 modal-content)
 * @param {string} [props.overlayClassName] 바깥막 CSS 이름(기본 modal-overlay)
 * @param {import('react').RefObject<HTMLElement|null>} [props.initialFocusRef] 열릴 때 키보드 위치(없으면 창 자체)
 * @param {import('react').ReactNode} [props.children]
 */
export default function ModalShell({
  onClose, closeOnOverlay = true, closeOnEscape = true, role = 'dialog', label, labelledBy,
  contentClassName = 'modal-content', overlayClassName = 'modal-overlay', initialFocusRef, children,
}) {
  const boxRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const latest = useRef({ onClose, closeOnEscape })
  useEffect(() => { latest.current = { onClose, closeOnEscape } })

  useEffect(() => {
    const token = {}
    openShells.push(token)
    const previous = /** @type {HTMLElement|null} */ (document.activeElement)
    ;(initialFocusRef?.current || boxRef.current)?.focus()
    /** @param {KeyboardEvent} event */
    function onKeyDown(event) {
      if (event.key !== 'Escape' || openShells[openShells.length - 1] !== token) return
      if (latest.current.closeOnEscape) latest.current.onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      openShells.splice(openShells.indexOf(token), 1)
      previous?.focus?.()
    }
  }, [initialFocusRef])

  return (
    <div className={overlayClassName} onClick={closeOnOverlay ? onClose : undefined}>
      <div
        ref={boxRef}
        className={contentClassName}
        role={role}
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
