// ownerDataHooks.ts에서 분리한 일지(workData) 구독 훅 그룹 — 로직·주석 무변경 이동.
import { useSyncExternalStore } from 'react'
import { getState, subscribe } from './app-store.ts'
import type { DayRecordLike } from '../../domain/calendarBadges.ts'
import type { WorkDataByLogId } from '../../domain/financeTypes.ts'
import type { WorkDataTombstones } from '../../domain/workDataTombstones.ts'

const EMPTY_WORK_DATA = ({}) as Record<string, DayRecordLike>
/** 손익·미수·계산서용 — owner에 workLogs가 없을 때 고정 참조(useSyncExternalStore). */
const EMPTY_WORK_DATA_BY_LOG_ID = ({
  main: EMPTY_WORK_DATA,
}) as WorkDataByLogId

/**
 * store에서 ownerKey의 workData(state.workLogs[ownerKey].main)를 읽는다 — 없으면
 * 항상 같은 EMPTY_WORK_DATA 참조를 돌려준다(고정 상수라 매번 새 객체가 아니다).
 * useOwnerWorkData의 getSnapshot과 MainPageRoute.jsx의 saveDay(최신값을 커밋
 * 직전에 다시 읽을 때)가 이 함수 하나를 공유한다.
 */
export function readOwnerWorkData(ownerKey: string): Record<string, DayRecordLike> {
  return getState().workLogs[ownerKey]?.main || EMPTY_WORK_DATA
}

export function readOwnerLogWorkData(ownerKey: string, logId = 'main'): Record<string, DayRecordLike> {
  if (!logId || logId === 'main') return readOwnerWorkData(ownerKey)
  return getState().workLogs[ownerKey]?.[logId] || EMPTY_WORK_DATA
}

/**
 * ownerKey의 workData를 store에서 직접 구독한다. app-store.ts의
 * commitBatch/applyDomainToState는 관련 없는 커밋에서는 이 참조를 그대로 유지하므로
 * (불변 갱신 — 바뀐 도메인/ownerKey만 새 객체가 된다), useSyncExternalStore가
 * 요구하는 "변화 없으면 같은 참조" 조건을 그대로 만족한다.
 */
export function useOwnerWorkData(ownerKey: string): Record<string, DayRecordLike> {
  return useSyncExternalStore(subscribe, () => readOwnerWorkData(ownerKey))
}

/**
 * 손익·계산서·미수용 logId→일지 맵.
 * `workLogs[ownerKey]` 전체(main + 서브 차량번호)를 그대로 돌려준다 — 계산 엔진은
 * 이미 logId별 소스를 순회하므로, 여기만 main에 묶여 있으면 매출/미수에 기사가 안 잡힌다.
 * store 참조를 유지해 useSyncExternalStore 스냅샷이 안정적이다.
 */
export function readOwnerWorkDataByLogId(ownerKey: string): WorkDataByLogId {
  const logs = getState().workLogs[ownerKey]
  if (!logs || typeof logs !== 'object') return EMPTY_WORK_DATA_BY_LOG_ID
  return logs
}

export function useOwnerWorkDataByLogId(ownerKey: string) {
  return useSyncExternalStore(subscribe, () => readOwnerWorkDataByLogId(ownerKey))
}

const EMPTY_TOMBSTONES = ({}) as WorkDataTombstones

/** 빈 날 삭제 목록을 읽는다(구독 불필요 — 화면에서 쓰지 않음). */
export function readOwnerWorkDataTombstones(ownerKey: string): WorkDataTombstones {
  const raw = (getState().workDataDeletedDates[ownerKey]) as WorkDataTombstones | undefined
  return raw || EMPTY_TOMBSTONES
}
