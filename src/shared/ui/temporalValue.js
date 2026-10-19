// @ts-check
// TemporalInput/TemporalColumns가 공유하는 순수 날짜·시간 문자열 유틸.

/** @param {number} n */
export function pad(n) {
  return String(n).padStart(2, '0')
}

/** @param {number} year @param {number} month */
export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

/** @param {string} value */
export function parseDateValue(value) {
  if (value) {
    const [year, month, day] = value.split('-').map(Number)
    return { year, month, day }
  }
  const today = new Date()
  return { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() }
}

/** @param {string} value */
export function parseTimeValue(value) {
  if (value) {
    const [hour, minute] = value.split(':').map(Number)
    return { hour, minute }
  }
  const now = new Date()
  return { hour: now.getHours(), minute: now.getMinutes() }
}

/**
 * date/time 공용 cursor 상태 — 필드를 항상 다 채워서 union 타입 좁히기 문제를 피한다
 * (실제 쓰는 화면은 type에 맞는 절반뿐, 나머지는 무시됨).
 * @param {'date'|'time'} type @param {string} value
 */
export function parseCursor(type, value) {
  return type === 'date'
    ? { ...parseDateValue(value), hour: 0, minute: 0 }
    : { year: 0, month: 1, day: 1, ...parseTimeValue(value) }
}
