// @ts-check
import { isValidCalendarDateKey } from './dateKey.js'

export function getYearOptions() {
  const currentYear = new Date().getFullYear()
  const years = []
  for (let y = currentYear - 10; y <= currentYear + 10; y++) {
    years.push(y)
  }
  return years
}

/** @param {Date} viewDate @param {number} delta */
export function shiftMonth(viewDate, delta) {
  return new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1)
}

/** @param {Date} viewDate @param {number} year @param {number} month */
export function setYearMonth(viewDate, year, month) {
  return new Date(year, month, 1)
}

/** @param {Date} viewDate */
export function buildCalendarCells(viewDate) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const today = new Date()

  const firstDay = new Date(year, month, 1).getDay()
  const lastDate = new Date(year, month + 1, 0).getDate()
  const totalWeeks = Math.ceil((firstDay + lastDate) / 7)
  const totalVisibleCells = totalWeeks * 7

  const cells = []
  for (let i = 0; i < totalVisibleCells; i++) {
    const dayIndex = i - firstDay + 1
    if (dayIndex >= 1 && dayIndex <= lastDate) {
      const dayOfWeek = new Date(year, month, dayIndex).getDay()
      const isToday =
        dayIndex === today.getDate() &&
        month === today.getMonth() &&
        year === today.getFullYear()

      cells.push({
        key: `${year}-${String(month + 1).padStart(2, '0')}-${String(dayIndex).padStart(2, '0')}`,
        day: dayIndex,
        empty: false,
        sunday: dayOfWeek === 0,
        saturday: dayOfWeek === 6,
        today: isToday,
      })
    } else {
      cells.push({ key: `pad-${i}`, empty: true })
    }
  }
  return cells
}

export function todayWorkLogSelection(date = new Date()) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return {
    dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    month,
    day,
  }
}

// 달력 월을 URL 쿼리에 두는 왕복 함수는 calendarViewDate.js에 있다.

/**
 * `/app/day/:date` 라우트 파라미터(`YYYY-MM-DD`)를 MainPageRoute의 `selected` 모양으로
 * 바꾼다. 실제 있는 날짜가 아니면(`2026-02-30` 등) null(달력 표시) — durable 큐와 같은 isValidCalendarDateKey를 쓴다.
 * @param {string | undefined} dateKey
 * @returns {{ dateKey: string, month: number, day: number } | null}
 */
export function parseDateKeySelection(dateKey) {
  if (!dateKey || !isValidCalendarDateKey(dateKey)) return null
  return {
    dateKey,
    month: Number(dateKey.slice(5, 7)),
    day: Number(dateKey.slice(8, 10)),
  }
}
