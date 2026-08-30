// @ts-check
import { useEffect, useId, useRef, useState } from 'react'
import './calendar-date-select.css'

/**
 * 바닐라 `data-app-dropdown` 년/월 선택기와 같은 버튼+listbox.
 * 네이티브 select 색만 바꾸는 방식은 쓰지 않는다.
 *
 * @param {Object} props
 * @param {string} props.label
 * @param {string|number} props.value
 * @param {Array<{ value: string, label: string }>} props.options
 * @param {(next: string) => void} props.onChange
 */
export default function CalendarDateSelect({ label, value, options, onChange }) {
  const listId = useId()
  const rootRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const listRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(0, options.findIndex((item) => String(item.value) === String(value)))
  const [activeIndex, setActiveIndex] = useState(selectedIndex)
  const selected = options[selectedIndex] || options[0]

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (/** @type {MouseEvent} */ event) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current && !rootRef.current.contains(target)) setOpen(false)
    }
    const onKey = (/** @type {KeyboardEvent} */ event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const list = listRef.current
    const option = list?.querySelector(`[data-index="${activeIndex}"]`)
    if (option && typeof option.scrollIntoView === 'function') option.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  /** @param {number} next */
  function move(next) {
    if (options.length === 0) return
    const wrapped = (next + options.length) % options.length
    setActiveIndex(wrapped)
  }

  /** @param {string} nextValue */
  function choose(nextValue) {
    onChange(nextValue)
    setOpen(false)
  }

  return (
    <div className={`app-dropdown app-date-dropdown${open ? ' open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="app-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        onClick={() => {
          setActiveIndex(selectedIndex)
          setOpen((prev) => !prev)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (!open) {
              setActiveIndex(selectedIndex)
              setOpen(true)
            } else move(activeIndex + 1)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) {
              setActiveIndex(selectedIndex)
              setOpen(true)
            } else move(activeIndex - 1)
          } else if (event.key === 'Enter' && open) {
            event.preventDefault()
            const item = options[activeIndex]
            if (item) choose(String(item.value))
          }
        }}
      >
        <span className="app-dropdown-value">{selected ? selected.label : ''}</span>
        <span className="app-dropdown-chevron" aria-hidden="true" />
      </button>
      <div
        id={listId}
        className="app-dropdown-menu"
        role="listbox"
        ref={listRef}
        hidden={!open}
        aria-label={label}
      >
        {open && options.map((item, index) => (
          <button
            key={String(item.value)}
            type="button"
            className="app-dropdown-option"
            role="option"
            data-index={index}
            aria-selected={String(item.value) === String(value)}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => choose(String(item.value))}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
