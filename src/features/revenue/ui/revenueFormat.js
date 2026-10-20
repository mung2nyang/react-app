// @ts-check
// 여러 매출 화면이 같이 쓰는 작은 순수 포맷 함수.
/**
 * @param {number} year
 * @param {number} monthIndex
 */
export function monthKeyOf(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

/** @param {number} amount */
export function won(amount) {
  // NaN·-0은 0으로 (0을 부호 반전하면 "-0원"으로 보이는 것 방지)
  return `${(Number(amount) || 0).toLocaleString('ko-KR')}원`
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
