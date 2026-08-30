// @ts-check
// 운행 기록(workData) 저장소 I/O. 파생 계산·콜상세·결제 원장은 Step 1에서 200줄 제한
// 때문에 day-record.js / call-details.js / payments.js로 분리했고, Step 4에서 그 셋을
// 전부 domain/으로 옮겼다. 이 파일은 기존 임포트 경로('../lib/workData.js')를 그대로
// 유지하는 배럴이다 — 호출부는 한 곳도 바꿀 필요 없다.
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

// 재감사 3차(FAIL 지적 1번) — "빈 날 삭제"가 workData에서 그 dateKey를 지우는 것으로
// 끝나면 syncWorkData.js(로컬에 남은 날짜만 도는 upsert 루프)가 서버에 그 삭제를
// 절대 알리지 못한다. useDayDraft.js/pendingWorkDataWrites.js 둘 다 이제 saveWorkData
// 대신 이 함수를 쓴다 — dateKey가 실제로(previousData에는 있었는데 nextData에는 없게)
// 지워졌을 때만 tombstone을 같은 commitBatch(원자적, 하나의 local transaction)에 실어
// 기록하고, 반대로(삭제 대기 중이던 날짜에 재입력이 들어와) 그 dateKey가 다시
// 채워지면 아직 못 보낸 tombstone을 즉시 지운다(그대로 두면 나중에 방금 되살린
// 데이터를 syncDeletedWorkDates.js가 지워 버린다).
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

// 재감사 3차 — day-record.js/call-details.js 둘 다 이제 각자 CallDetailLike를
// callDetail.js에서 alias해 온다(자기 함수 시그니처에 쓰려고). 이 둘을 그대로
// `export *`로 합치면 TS가 "같은 이름이 두 모듈에서 나온다"고 본다(strict-inventory로
// checkJs:true 걸어보면 실측됨) — 함수 이름만 나열해 재수출하면 그 충돌을 피한다.
export {
  getFixedCount, getPalletCount, getFixedRouteCounts, applyFixedRouteRun, isOffDay,
  getCallDetails, backfillCallDetailIds, countCallTrips, dayTripCount, callFareTotal,
  callVatTotal, monthWorkFareSummary, saveDayRecord, monthCallUnpaidTotal, monthWorkTotal,
} from '../domain/day-record.js'
export {
  buildCallDetail, computeDistanceKm, upsertCallDetail, removeCallDetail,
} from '../domain/call-details.js'
export * from '../domain/payments.js'
