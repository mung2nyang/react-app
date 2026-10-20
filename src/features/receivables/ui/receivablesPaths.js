// @ts-check
// 8-C — 미수 목록·상세 라우트 경로 헬퍼(:client는 encodeURIComponent, :month는 YYYY-MM).

// search(`?back=mypage` 등)를 목록·상세 사이에서 계속 들고 다녀야 목록 뒤로가기가 들어온 곳으로 돌아간다.
/** @param {string} client @param {string} monthKey @param {string} [search] */
export function receivablesDetailPath(client, monthKey, search = '') {
  return `/app/receivables/${encodeURIComponent(client)}/${monthKey}${search}`
}

/** @param {string} [search] */
export function receivablesListPath(search = '') {
  return `/app/receivables${search}`
}

/** @param {string} [month] @returns {string|null} */
export function parseMonthParam(month) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null
  return month
}

/** @param {string} [client] */
export function parseClientParam(client) {
  if (!client) return ''
  try {
    return decodeURIComponent(client)
  } catch {
    return ''
  }
}
