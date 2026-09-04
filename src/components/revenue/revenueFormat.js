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
  return `${(Number(amount) || 0).toLocaleString('ko-KR')}원`
}

/** @param {string} [date] */
export function dateLabel(date) {
  if (!date) return ''
  return `${date.slice(5).replace('-', '/')} `
}

/**
 * driverSelf 순이익 라벨: settlement.label 끝의 (30%)/(월급)을 붙인다.
 * @param {{ label?: string }|null|undefined} settlement
 */
export function driverSelfNetProfitLabel(settlement) {
  const m = settlement?.label && /\(([^)]+)\)\s*$/.exec(String(settlement.label))
  return m ? `당월 순이익 (${m[1]})` : '당월 순이익'
}
