// @ts-check
// 운행 기록(workData) 저장소 I/O + domain/의 day-record·call-details·payments 재수출 배럴.
import { readJsonKey } from '../store/persist.js'
import { commitBatch } from '../store/app-store.js'
import { commitLogWorkData, commitWorkData } from '../store/commitHelpers.js'
import { readOwnerWorkDataTombstones } from '../store/ownerDataHooks.js'
import { addWorkDataTombstone, removeWorkDataTombstone } from '../domain/workDataTombstones.js'

/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */

/** @param {string} [ownerKey] */
export function loadWorkData(ownerKey = 'guest') {
  const parsed = readJsonKey('workData', ownerKey, {})
  return parsed && typeof parsed === 'object' ? parsed : {}
}

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

  /** @type {import('../domain/workDataTombstones.js').WorkDataTombstones|null} */
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

// day-record.js·call-details.js가 같은 타입 이름을 내보내 export *가 충돌하므로 함수 이름을 나열해 재수출한다.
export {
  getFixedCount, getPalletCount, getFixedRouteCounts, applyFixedRouteRun, isOffDay,
  getCallDetails, backfillCallDetailIds, countCallTrips, dayTripCount, callFareTotal,
  callVatTotal, monthWorkFareSummary, saveDayRecord, monthCallUnpaidTotal, monthWorkTotal,
} from '../domain/day-record.js'
export {
  buildCallDetail, computeDistanceKm, upsertCallDetail, removeCallDetail,
} from '../domain/call-details.js'
export * from '../domain/payments.js'
