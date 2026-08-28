// @ts-check
// 재감사 9차(FAIL 지적 4번) — dateKey(`YYYY-MM-DD`) 검증을 "정규식 모양만 확인"에서
// "실제 존재하는 달력 날짜인지 왕복 검증"으로 강화한 함수를 durableStorage.js
// 내부 전용으로만 두지 않는다. 여기 공용 domain 모듈로 분리해서
// durableStorage.js(readDurable)와 domain/calendar.js(parseDateKeySelection, 곧
// MainPageRoute.jsx가 실제 라우팅에 쓴다) 양쪽이 같은 함수를 쓰게 한다 — 한쪽만
// 고치면 "durable에만 있으면 안전"이라는 착각이 실제 URL 경로에서는 안 지켜진다.
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
