// @ts-check
// 입력 중이고 글자가 있을 때만 오른쪽 X로 한 번에 지우는 입력칸. 지우기는 "글자를 다 지운 입력"과 똑같이 onChange를 거친다.
import { useRef, useState } from 'react'
import './clearable-input.css'

/** @param {import('react').InputHTMLAttributes<HTMLInputElement>} props */
export default function ClearableInput(props) {
  const { onFocus, onBlur, ...rest } = props
  const inputRef = useRef(/** @type {HTMLInputElement|null} */ (null))
  const [focused, setFocused] = useState(false)
  const showClear = focused && String(props.value ?? '') !== ''

  function clear() {
    const input = inputRef.current
    if (!input) return
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    setValue?.call(input, '')
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  }

  return (
    <span className={`clearable-input${showClear ? ' has-clear' : ''}`}>
      <input
        {...rest}
        ref={inputRef}
        onFocus={(e) => { setFocused(true); onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); onBlur?.(e) }}
      />
      {showClear && (
        <button
          type="button"
          className="clearable-input-btn"
          aria-label="입력 지우기"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={clear}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12"></circle><path d="M16 8 8 16M8 8l8 8"></path></svg>
        </button>
      )}
    </span>
  )
}
