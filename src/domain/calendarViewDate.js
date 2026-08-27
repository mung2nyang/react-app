// @ts-check
// Step 5(달력 홈 재작성) 재감사 3번: viewDate를 컴포넌트 로컬 state가 아니라 `/app`의
// `?y=&m=` 쿼리에 두는 왕복 함수 — calendar.js에서 분리한 타입 전용 모듈이다(그
// 파일은 아직 // @ts-check가 없고, 붙이면 shiftMonth 등 기존 함수의 선행 타입
// 부채가 그대로 드러난다). URL이 진실의 원천이라 새로고침해도 그대로 남는다(완료
// 조건 "새로고침 후 같은 달"). 값이 없거나 잘못됐으면(직접 `/app`으로 진입 등) 오늘
// 날짜로 대체한다.

/**
 * @param {URLSearchParams} searchParams
 * @returns {Date}
 */
export function viewDateFromSearchParams(searchParams) {
  const yParam = searchParams.get('y')
  const mParam = searchParams.get('m')
  const y = yParam === null ? NaN : parseInt(yParam, 10)
  const m = mParam === null ? NaN : parseInt(mParam, 10)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 0 || m > 11) return new Date()
  return new Date(y, m, 1)
}

/**
 * @param {Date} viewDate
 * @returns {{ y: string, m: string }}
 */
export function searchParamsForViewDate(viewDate) {
  return { y: String(viewDate.getFullYear()), m: String(viewDate.getMonth()) }
}
