// @ts-check
// TemporalInput 메뉴의 연/월/일·시/분 스크롤 컬럼. 원본 ui-widgets.js renderDate/renderTime 포팅.
import { daysInMonth, pad } from './temporalValue.js'

/**
 * @param {Object} props
 * @param {{year: number, month: number, day: number, hour: number, minute: number}} props.cursor
 * @param {string} [props.min]
 * @param {string} [props.max]
 * @param {(next: {year: number, month: number, day: number, hour: number, minute: number}) => void} props.onCursor
 * @param {(day: number) => void} props.onSelectDay
 */
export function DateColumns({ cursor, min, max, onCursor, onSelectDay }) {
  const minYear = min ? Number(min.slice(0, 4)) : cursor.year - 8
  const maxYear = max ? Number(max.slice(0, 4)) : cursor.year + 8
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const days = Array.from({ length: daysInMonth(cursor.year, cursor.month) }, (_, i) => i + 1)

  return (
    <div className="app-temporal-columns date-columns">
      <div className="app-temporal-column">
        {years.map((year) => (
          <Option key={year} selected={year === cursor.year} onClick={() => {
            onCursor({ ...cursor, year, day: Math.min(cursor.day, daysInMonth(year, cursor.month)) })
          }}>{year}년</Option>
        ))}
      </div>
      <div className="app-temporal-column">
        {months.map((month) => (
          <Option key={month} selected={month === cursor.month} onClick={() => {
            onCursor({ ...cursor, month, day: Math.min(cursor.day, daysInMonth(cursor.year, month)) })
          }}>{month}월</Option>
        ))}
      </div>
      <div className="app-temporal-column">
        {days.map((day) => (
          <Option key={day} selected={day === cursor.day} onClick={() => onSelectDay(day)}>{day}일</Option>
        ))}
      </div>
    </div>
  )
}

/**
 * @param {Object} props
 * @param {{year: number, month: number, day: number, hour: number, minute: number}} props.cursor
 * @param {(hour: number) => void} props.onCommitHour
 * @param {(minute: number) => void} props.onSelectMinute
 */
export function TimeColumns({ cursor, onCommitHour, onSelectMinute }) {
  const hours = Array.from({ length: 24 }, (_, i) => i)
  const minutes = Array.from({ length: 60 }, (_, i) => i)

  return (
    <div className="app-temporal-columns time-columns">
      <div className="app-temporal-column">
        {hours.map((hour) => (
          <Option key={hour} selected={hour === cursor.hour} onClick={() => onCommitHour(hour)}>{pad(hour)}시</Option>
        ))}
      </div>
      <div className="app-temporal-column">
        {minutes.map((minute) => (
          <Option key={minute} selected={minute === cursor.minute} onClick={() => onSelectMinute(minute)}>{pad(minute)}분</Option>
        ))}
      </div>
    </div>
  )
}

/**
 * @param {Object} props
 * @param {boolean} props.selected
 * @param {() => void} props.onClick
 * @param {import('react').ReactNode} props.children
 */
function Option({ selected, onClick, children }) {
  return (
    <button type="button" className="app-temporal-option" aria-selected={selected} onClick={onClick}>
      {children}
    </button>
  )
}
