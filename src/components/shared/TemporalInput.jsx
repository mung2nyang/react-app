// @ts-check
// 원본 ui-widgets.js initAppTemporalInputs 포팅 — 네이티브 date/time input을
// 트리거 버튼 + document.body 포털 스크롤 컬럼 메뉴로 대체한다.
// 부모 modal의 overflow:hidden을 벗어나야 해서 CalendarDateSelect(비-modal, absolute)와
// 달리 포털 + position:fixed를 쓴다. 컬럼 렌더는 TemporalColumns.jsx로 분리.
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DateColumns, TimeColumns } from './TemporalColumns.jsx'
import { pad, parseCursor } from './temporalValue.js'
import './temporal-input.css'

const EDGE = 8
const GAP = 7

/**
 * @param {Object} props
 * @param {'date'|'time'} props.type
 * @param {string} props.id
 * @param {string} props.value
 * @param {(event: { target: { value: string } }) => void} props.onChange
 * @param {string} [props.className]
 * @param {string} [props.min]
 * @param {string} [props.max]
 * @param {boolean} [props.disabled]
 */
export default function TemporalInput({ type, id, value, onChange, className = '', min, max, disabled = false }) {
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(() => parseCursor(type, value))
  const [pos, setPos] = useState(/** @type {{left: number, top: number, width: number}|null} */ (null))
  const triggerRef = useRef(/** @type {HTMLButtonElement|null} */ (null))
  const menuRef = useRef(/** @type {HTMLDivElement|null} */ (null))

  /** @param {string} nextValue */
  function commit(nextValue) {
    onChange({ target: { value: nextValue } })
  }

  function reposition() {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const viewportWidth = window.visualViewport?.width || document.documentElement.clientWidth
    const availableRight = viewportWidth - EDGE
    const left = rect.right > availableRight ? Math.max(EDGE, availableRight - rect.width) : rect.left
    setPos({ left, top: rect.bottom + GAP, width: rect.width })
  }

  useEffect(() => {
    if (!open) return undefined
    setCursor(parseCursor(type, value))
    reposition()
    /** @param {MouseEvent} event */
    const onPointerDown = (event) => {
      const target = event.target
      if (!(target instanceof window.Node)) return
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    /** @param {KeyboardEvent} event */
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type])

  useEffect(() => {
    if (!open) return
    const options = menuRef.current?.querySelectorAll('[aria-selected="true"]')
    options?.forEach((option) => {
      if (typeof option.scrollIntoView === 'function') option.scrollIntoView({ block: 'center' })
    })
  }, [open, cursor])

  /** @param {number} day */
  function selectDay(day) {
    commit(`${cursor.year}-${pad(cursor.month)}-${pad(day)}`)
    setOpen(false)
    triggerRef.current?.focus()
  }

  /** @param {number} hour */
  function commitHour(hour) {
    const minute = value ? cursor.minute : 0
    commit(`${pad(hour)}:${pad(minute)}`)
    setCursor({ ...cursor, hour, minute })
  }

  /** @param {number} minute */
  function selectMinute(minute) {
    commit(`${pad(cursor.hour)}:${pad(minute)}`)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const label = !value ? (type === 'date' ? '날짜 선택' : '시간 선택') : type === 'date' ? value.replaceAll('-', '.') : value

  return (
    <span className={`app-temporal app-temporal-${type} ${className}`.trim()}>
      <input
        type={type}
        id={id}
        value={value || ''}
        min={min}
        max={max}
        disabled={disabled}
        readOnly
        tabIndex={-1}
        onClick={(event) => {
          event.preventDefault()
          if (!disabled) setOpen(true)
        }}
      />
      <button
        type="button"
        ref={triggerRef}
        className="app-temporal-trigger"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="app-temporal-value">{label}</span>
        <span className="app-temporal-icon" aria-hidden="true" />
      </button>
      {open && pos && createPortal(
        <div
          id={menuId}
          ref={menuRef}
          className="app-temporal-menu"
          style={{ left: pos.left, top: pos.top, width: pos.width }}
        >
          {type === 'date'
            ? <DateColumns cursor={cursor} min={min} max={max} onCursor={setCursor} onSelectDay={selectDay} />
            : <TimeColumns cursor={cursor} onCommitHour={commitHour} onSelectMinute={selectMinute} />}
        </div>,
        document.body
      )}
    </span>
  )
}
