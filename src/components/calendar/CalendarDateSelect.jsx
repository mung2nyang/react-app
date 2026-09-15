// @ts-check
import AppDropdown from '../shared/AppDropdown.jsx'
import './calendar-date-select.css'

/**
 * 연/월 전용 래퍼 — 로직은 `AppDropdown`, 날짜 네비 레이아웃만 남긴다.
 *
 * @param {Object} props
 * @param {string} props.label
 * @param {string|number} props.value
 * @param {Array<{ value: string, label: string }>} props.options
 * @param {(next: string) => void} props.onChange
 */
export default function CalendarDateSelect({ label, value, options, onChange }) {
  return (
    <AppDropdown
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      className="app-date-dropdown"
    />
  )
}
