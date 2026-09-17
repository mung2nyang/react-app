// @ts-check
// 재감사 2차(FAIL 지적) — RevenuePage.jsx(352줄)를 "기존 대형 파일이니 예외"로 두지
// 말라는 지시에 따라 실제로 쪼갰다. 이 파일은 여러 뷰가 같이 쓰는 아주 작은 순수
// 포맷 함수만 담는다.
/**
 * @param {number} year
 * @param {number} monthIndex
 */
export function monthKeyOf(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

/** @param {number} amount */
export function won(amount) {
  return `${(Number.isNaN(Number(amount)) ? 0 : Number(amount)).toLocaleString('ko-KR')}원`
}

/** @param {string} [date] */
export function dateLabel(date) {
  if (!date) return ''
  return `${date.slice(5).replace('-', '/')} `
}

/**
 * driverSelf 상단 카드 라벨: 월급제 → "이번 달 월급", 매출제(%) →
 * "이번 달 정산액 N%", 매출제(건당·비율 미확정) → "이번 달 정산액".
 * (차주 화면의 "당월 순이익"과 구분)
 * @param {{ label?: string, payMode?: string|null }|null|undefined} settlement
 */
export function driverSelfNetProfitLabel(settlement) {
  if (settlement?.payMode === 'salary') return '이번 달 월급'
  const label = String(settlement?.label || '')
  const m = /\(([^)]+)\)\s*$/.exec(label)
  if (m?.[1] === '월급') return '이번 달 월급'
  if (m && /^\d+(\.\d+)?%$/.test(m[1])) return `이번 달 정산액 ${m[1]}`
  return '이번 달 정산액'
}
