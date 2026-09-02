// @ts-check
// 8-C — 미수 목록·상세 라우트 경로 헬퍼(:client는 encodeURIComponent, :month는 YYYY-MM).

/** @param {string} client @param {string} monthKey */
export function receivablesDetailPath(client, monthKey) {
  return `/app/receivables/${encodeURIComponent(client)}/${monthKey}`
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
