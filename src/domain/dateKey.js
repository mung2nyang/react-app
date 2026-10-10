// @ts-check
// dateKey(`YYYY-MM-DD`)가 실제 있는 날짜인지 왕복 검증. durableStorage.js와 calendar.js(라우팅)가
// 같은 함수를 써야 두 경로 판정이 어긋나지 않는다.
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * `YYYY-MM-DD` 문자열이 실제로 존재하는 달력 날짜를 가리키는지 확인한다. 정규식
 * 통과 후 year/month/day로 실제 `Date.UTC(...)`를 만들어 다시 읽어서 왕복이
 * 그대로인지(월/일이 넘쳐서 다른 날짜로 밀리지 않았는지) 확인한다 — UTC 기준이라
 * 로컬 타임존 오프셋에 안 좌우된다. `2026-99-99`/`2026-02-30`/`2026-02-29`(2026은
 * 윤년이 아니다) 같은 값을 정확히 거부하고, `2028-02-29`(윤년)/`2026-12-31`은
 * 정상 허용한다.
 * @param {string} dateKey
 * @returns {boolean}
 */
export function isValidCalendarDateKey(dateKey) {
  if (!DATE_KEY_RE.test(dateKey)) return false
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}
