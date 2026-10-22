// 달력 월을 `?y=&m=` 쿼리에 두는 왕복 함수 — 새로고침해도 같은 달이 남는다. 값이 없거나 잘못되면 오늘 날짜.

export function viewDateFromSearchParams(searchParams: URLSearchParams): Date {
  const yParam = searchParams.get('y')
  const mParam = searchParams.get('m')
  const y = yParam === null ? NaN : parseInt(yParam, 10)
  const m = mParam === null ? NaN : parseInt(mParam, 10)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 0 || m > 11) return new Date()
  return new Date(y, m, 1)
}

export function searchParamsForViewDate(viewDate: Date): { y: string, m: string } {
  return { y: String(viewDate.getFullYear()), m: String(viewDate.getMonth()) }
}
