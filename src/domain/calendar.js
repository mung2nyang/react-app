export function getYearOptions() {
  const currentYear = new Date().getFullYear()
  const years = []
  for (let y = currentYear - 10; y <= currentYear + 10; y++) {
    years.push(y)
  }
  return years
}

export function shiftMonth(viewDate, delta) {
  return new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1)
}

export function setYearMonth(viewDate, year, month) {
  return new Date(year, month, 1)
}

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
// 함수)는 calendarViewDate.js로 옮겼다(Step 5 재감사 3번 — 타입 전용 모듈 분리, 이
// 파일은 아직 // @ts-check 없음).

/**
 * `/app/day/:date` 라우트 파라미터(`YYYY-MM-DD`)를 MainPageRoute의 `selected` 모양으로
 * 바꾼다. Step 3 라우터 도입 — 값이 아니면 null(달력 표시)을 돌려준다.
 * @param {string | undefined} dateKey
 * @returns {{ dateKey: string, month: number, day: number } | null}
 */
export function parseDateKeySelection(dateKey) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null
  return {
    dateKey,
    month: Number(dateKey.slice(5, 7)),
    day: Number(dateKey.slice(8, 10)),
  }
}
