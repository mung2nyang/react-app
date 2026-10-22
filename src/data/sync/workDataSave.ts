// 운행 기록(workData) 저장 — 계산 규칙은 domain/의 day-record·call-details·payments.
import { commitBatch } from '../store/app-store.ts'
import { commitLogWorkData, commitWorkData } from '../store/commitHelpers.ts'
import { readOwnerWorkDataTombstones } from '../store/ownerDataHooks.ts'
import { addWorkDataTombstone, removeWorkDataTombstone } from '../../domain/workDataTombstones.ts'
import type { DayRecordLike } from '../../domain/dayRecordTypes.ts'
import type { WorkDataTombstones } from '../../domain/workDataTombstones.ts'

export function saveWorkData(ownerKey: string, data: Record<string, DayRecordLike>) {
  commitWorkData(ownerKey, data)
}

// workData 삭제와 빈 날 삭제 목록(tombstone)을 같은 commitBatch로 기록한다. 지웠던 날짜에 다시 입력이 들어오면 tombstone을 바로 지운다.
export function saveWorkDataWithTombstoneCheck(ownerKey: string, dateKey: string, previousData: Record<string, DayRecordLike>, nextData: Record<string, DayRecordLike>) {
  const hadRecordBefore = !!previousData[dateKey]
  const hasRecordNow = !!nextData[dateKey]
  const existingTombstones = readOwnerWorkDataTombstones(ownerKey)
  const hadTombstone = dateKey in existingTombstones

  let nextTombstones: WorkDataTombstones | null = null
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

/** 서브 로그는 daily_logs tombstone 대상이 아니다(syncWorkData.ts가 메인만 동기화). */
export function saveLogWorkDataWithTombstoneCheck(ownerKey: string, logId: string, dateKey: string, previousData: Record<string, DayRecordLike>, nextData: Record<string, DayRecordLike>) {
  if (!logId || logId === 'main') {
    saveWorkDataWithTombstoneCheck(ownerKey, dateKey, previousData, nextData)
    return
  }
  commitLogWorkData(ownerKey, logId, nextData)
}
