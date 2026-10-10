// @ts-check
// 빈 날 삭제 목록(tombstone: dateKey -> 지운 시각 ISO) 순수 함수 — hydrate가 지운 날을 되살리지 않게 거른다.
// 저장은 store/ownerDataHooks.js(읽기)·lib/workData.js(쓰기)가 한다.
/** @typedef {Record<string, string>} WorkDataTombstones dateKey -> 삭제된 시각(ISO) */

/**
 * @param {WorkDataTombstones|undefined} tombstones
 * @param {string} dateKey
 * @returns {WorkDataTombstones}
 */
export function addWorkDataTombstone(tombstones, dateKey) {
  return { ...(tombstones || {}), [dateKey]: new Date().toISOString() }
}

/**
 * @param {WorkDataTombstones|undefined} tombstones
 * @param {string} dateKey
 * @returns {WorkDataTombstones}
 */
export function removeWorkDataTombstone(tombstones, dateKey) {
  if (!tombstones || !(dateKey in tombstones)) return tombstones || {}
  const next = { ...tombstones }
  delete next[dateKey]
  return next
}
