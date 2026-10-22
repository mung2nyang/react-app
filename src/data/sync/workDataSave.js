// @ts-check
// 운행 기록(workData) 저장 — 계산 규칙은 domain/의 day-record·call-details·payments.
import { commitBatch } from '../store/app-store.js'
import { commitLogWorkData, commitWorkData } from '../store/commitHelpers.js'
import { readOwnerWorkDataTombstones } from '../store/ownerDataHooks.js'
import { addWorkDataTombstone, removeWorkDataTombstone } from '../../domain/workDataTombstones.ts'

/** @typedef {import('../../domain/dayRecordTypes.ts').DayRecordLike} DayRecordLike */

/**
 * @param {string} ownerKey
 * @param {Record<string, DayRecordLike>} data
 */
export function saveWorkData(ownerKey, data) {
  commitWorkData(ownerKey, data)
}

// workData 삭제와 빈 날 삭제 목록(tombstone)을 같은 commitBatch로 기록한다. 지웠던 날짜에 다시 입력이 들어오면 tombstone을 바로 지운다.
/**
 * @param {string} ownerKey
 * @param {string} dateKey
 * @param {Record<string, DayRecordLike>} previousData
 * @param {Record<string, DayRecordLike>} nextData
 */
export function saveWorkDataWithTombstoneCheck(ownerKey, dateKey, previousData, nextData) {
  const hadRecordBefore = !!previousData[dateKey]
  const hasRecordNow = !!nextData[dateKey]
  const existingTombstones = readOwnerWorkDataTombstones(ownerKey)
  const hadTombstone = dateKey in existingTombstones

  /** @type {import('../../domain/workDataTombstones.ts').WorkDataTombstones|null} */
  let nextTombstones = null
  if (!hasRecordNow && hadRecordBefore) nextTombstones = addWorkDataTombstone(existingTombstones, dateKey)
  else if (hasRecordNow && hadTombstone) nextTombstones = removeWorkDataTombstone(existingTombstones, dateKey)

  if (!nextTombstones) {
    saveWorkData(ownerKey, nextData)
    return
  }
  commitBatch([
    { domain: 'workData', ownerKey, value: nextData },
    { domain: 'workDataDeletedDates', ownerKey, value: nextTombstones },
  ])
}

/**
 * 서브 로그는 daily_logs tombstone 대상이 아니다(syncWorkData.js가 메인만 동기화).
 * @param {string} ownerKey
 * @param {string} logId
 * @param {string} dateKey
 * @param {Record<string, DayRecordLike>} previousData
 * @param {Record<string, DayRecordLike>} nextData
 */
export function saveLogWorkDataWithTombstoneCheck(ownerKey, logId, dateKey, previousData, nextData) {
  if (!logId || logId === 'main') {
    saveWorkDataWithTombstoneCheck(ownerKey, dateKey, previousData, nextData)
    return
  }
  commitLogWorkData(ownerKey, logId, nextData)
}
