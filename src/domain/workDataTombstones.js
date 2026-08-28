// @ts-check
// 재감사 3차(FAIL 지적 1번) — "빈 날 삭제"가 로컬 workData에서 그 dateKey를 지우는
// 것으로 끝나서, syncWorkData.js(로컬에 있는 날짜만 순회하는 upsert 루프)가 그
// 삭제를 서버에 절대 알리지 못했다(Supabase의 daily_logs/transport_details가 그대로
// 남는다) — 다음 hydrate가 그 stale row를 다시 읽어와 "삭제된 날"을 되살렸다. 이
// 파일은 "아직 서버에 못 알린 로컬 삭제" 목록(tombstone: dateKey -> 지운 시각 ISO)을
// 다루는 순수 함수만 담는다. 실제 저장/커밋은 store/ownerDataHooks.js(읽기)와
// lib/workData.js(쓰기 오케스트레이션)가 한다 — day-record.js의 saveDayRecord와 같은
// "순수 계산 vs 원자적 커밋" 분리.
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
