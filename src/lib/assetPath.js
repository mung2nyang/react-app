// @ts-check
// public/ 자산 경로. Vite `base`(`/` 또는 `/react-app/`)에 맞춰
// GitHub Pages에서도 404가 나지 않게 한다.

/**
 * @param {string} path public 기준 경로 (`/images/...` 또는 `images/...`)
 * @returns {string}
 */
export function assetPath(path) {
  const env = import.meta.env
  const base = (env && env.BASE_URL) || '/'
  const normalized = path.startsWith('/') ? path.slice(1) : path
  return `${base}${normalized}`
}
