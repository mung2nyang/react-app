// @ts-check
// 금액 칸: 친 글자(소수점 포함)는 칸 안에만 두고, 폼에는 반올림한 쉼표 정수만 넘긴다(로드맵 43, 저장 값에 점이 들어가면 불러오기가 깨짐).
import { useState } from 'react'
import { roundCurrencyText } from '../../domain/money.js'

/** 친 글자 → 칸에 보일 글자: 정수 부분은 쉼표, 첫 점 뒤 숫자는 그대로. @param {string} text */
function displayText(text) {
  const raw = String(text).replace(/[^0-9.]/g, '')
  const dot = raw.indexOf('.')
  const intDigits = (dot >= 0 ? raw.slice(0, dot) : raw).replace(/^0+(?=\d)/, '')
  const intShown = intDigits ? Number(intDigits).toLocaleString('ko-KR') : (dot >= 0 ? '0' : '')
  return dot >= 0 ? `${intShown}.${raw.slice(dot + 1).replace(/\./g, '')}` : intShown
}

/**
 * @param {Omit<import('react').InputHTMLAttributes<HTMLInputElement>, 'value'|'onChange'> & {
 *   value: string, onValueChange: (next: string) => void }} props
 */
export default function CurrencyInput({ value, onValueChange, onBlur, ...rest }) {
  const [typed, setTyped] = useState(/** @type {string|null} */ (null))
  // 폼 값이 밖에서 바뀌면(초기화 등) 친 글자 대신 폼 값을 보인다.
  const shown = typed !== null && roundCurrencyText(typed) === value ? typed : value
  return (
    <input
      inputMode="numeric"
      {...rest}
      value={shown}
      onChange={(e) => {
        const next = displayText(e.target.value)
        setTyped(next)
        onValueChange(roundCurrencyText(next))
      }}
      onBlur={(e) => { setTyped(null); onBlur?.(e) }}
    />
  )
}
