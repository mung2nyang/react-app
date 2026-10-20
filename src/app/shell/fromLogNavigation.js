// @ts-check
/** @param {string} pathname */
export function parseAppLogPath(pathname) {
  const match = pathname.match(/^\/app\/logs\/([^/]+)\/day\/(\d{4}-\d{2}-\d{2})$/)
  if (!match) return null
  return { logId: decodeURIComponent(match[1]), dateKey: match[2] }
}

/**
 * 일지에서 차량 관리로 갈 때 출처(logId+date)를 location.state에 붙인다.
 * @param {string} pathname
 * @param {import('react-router-dom').To} to
 * @param {import('react-router-dom').NavigateOptions} [options]
 */
export function withFromLogState(pathname, to, options) {
  const dest = typeof to === 'string' ? to : (to && typeof to === 'object' && 'pathname' in to ? String(to.pathname || '') : '')
  if (!dest.startsWith('/app/cars')) return options
  const fromLog = parseAppLogPath(pathname)
  if (!fromLog) return options
  return { ...options, state: { ...(options && options.state && typeof options.state === 'object' ? options.state : {}), fromLog } }
}
