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

// viewDateFromSearchParams/searchParamsForViewDate(달력 월을 URL 쿼리에 두는 왕복
// 함수)는 calendarViewDate.js로 옮겼다(Step 5 재감사 3번 — 타입 전용 모듈 분리).
// 재감사 10차(FAIL 지적 4번) — 이 파일도 이제 // @ts-check 대상이다.

/**
 * `/app/day/:date` 라우트 파라미터(`YYYY-MM-DD`)를 MainPageRoute의 `selected` 모양으로
 * 바꾼다. Step 3 라우터 도입 — 값이 아니면 null(달력 표시)을 돌려준다. 재감사
 * 9차(FAIL 지적 4번) — 정규식 모양만 보지 않고 domain/dateKey.js의 공용
 * isValidCalendarDateKey로 실제 존재하는 달력 날짜인지까지 확인한다(예:
 * `2026-02-30`은 모양은 맞지만 실존하지 않는 날짜라 거부돼야 한다) — durable
 * 큐(durableStorage.js)가 쓰는 것과 같은 함수라, "URL은 통과시켰는데 durable은
 * 거부한다"처럼 두 경로가 어긋날 수 없다.
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
