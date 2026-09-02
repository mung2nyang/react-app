// @ts-check
// 콜상세 id 정규화. hydrate(서버 numeric id)와 일지 저장이 같은 규칙을 쓴다.

/**
 * @template {object} T
 * @param {T} item
 * @returns {T}
 */
export function withCoercedCallDetailId(item) {
  if (!item || typeof item !== 'object') return item
  const id = /** @type {{ id?: unknown }} */ (item).id
  if (typeof id === 'number' && Number.isFinite(id)) {
    return /** @type {T} */ ({ ...item, id: String(id) })
  }
  return item
}

/**
 * @param {import('./callDetail.js').CallDetailLike|null|undefined} detail
 * @returns {string}
 */
export function resolveCallDetailId(detail) {
  if (!detail || typeof detail !== 'object') return ''
  const coerced = withCoercedCallDetailId(detail)
  const id = coerced && typeof coerced === 'object' ? coerced.id : undefined
  return typeof id === 'string' ? id.trim() : ''
}

/**
 * @param {Array<import('./callDetail.js').CallDetailLike>|null|undefined} details
 * @param {string} detailId
 * @returns {number}
 */
export function findCallDetailIndex(details, detailId) {
  const key = String(detailId || '').trim()
  if (!key || !Array.isArray(details)) return -1
  return details.findIndex((item) => resolveCallDetailId(item) === key)
}

/**
 * 같은 id는 한 번만 남긴다(먼저 나온 항목). id 없는 레거시는 그대로 둔다.
 * @template {object} T
 * @param {Array<T>|null|undefined} list
 * @returns {Array<T>}
 */
export function dedupeCallDetailsById(list) {
  const seen = new Set()
  /** @type {Array<T>} */
  const next = []
  ;(Array.isArray(list) ? list : []).forEach((item) => {
    const coerced = withCoercedCallDetailId(item)
    if (!coerced || typeof coerced !== 'object') return
    const id = /** @type {{ id?: unknown }} */ (coerced).id
    const key = typeof id === 'string' ? id : ''
    if (key) {
      if (seen.has(key)) return
      seen.add(key)
    }
    next.push(coerced)
  })
  return next
}
