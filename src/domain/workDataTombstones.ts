// 빈 날 삭제 목록(tombstone: dateKey -> 지운 시각 ISO) 순수 함수 — hydrate가 지운 날을 되살리지 않게 거른다.
// 저장은 data/store/ownerDataHooks.js(읽기)·data/sync/workDataSave.js(쓰기)가 한다.
/** dateKey -> 삭제된 시각(ISO) */
export type WorkDataTombstones = Record<string, string>

export function addWorkDataTombstone(tombstones: WorkDataTombstones | undefined, dateKey: string): WorkDataTombstones {
  return { ...(tombstones || {}), [dateKey]: new Date().toISOString() }
}

export function removeWorkDataTombstone(tombstones: WorkDataTombstones | undefined, dateKey: string): WorkDataTombstones {
  if (!tombstones || !(dateKey in tombstones)) return tombstones || {}
  const next = { ...tombstones }
  delete next[dateKey]
  return next
}
