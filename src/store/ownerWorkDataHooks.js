// @ts-check
// ownerDataHooks.js에서 분리한 일지(workData) 구독 훅 그룹 — 로직·주석 무변경 이동.
import { useSyncExternalStore } from 'react'
import { getState, subscribe } from './app-store.js'

/** @typedef {import('../domain/calendarBadges.js').DayRecordLike} DayRecordLike */

const EMPTY_WORK_DATA = /** @type {Record<string, DayRecordLike>} */ ({})
/** 손익·미수·계산서용 — owner에 workLogs가 없을 때 고정 참조(useSyncExternalStore). */
const EMPTY_WORK_DATA_BY_LOG_ID = /** @type {import('../domain/financeTypes.js').WorkDataByLogId} */ ({
  main: EMPTY_WORK_DATA,
})

/**
 * store에서 ownerKey의 workData(state.workLogs[ownerKey].main)를 읽는다 — 없으면
 * 항상 같은 EMPTY_WORK_DATA 참조를 돌려준다(고정 상수라 매번 새 객체가 아니다).
 * useOwnerWorkData의 getSnapshot과 MainPageRoute.jsx의 saveDay(최신값을 커밋
 * 직전에 다시 읽을 때)가 이 함수 하나를 공유한다.
 * @param {string} ownerKey
 * @returns {Record<string, DayRecordLike>}
 */
export function readOwnerWorkData(ownerKey) {
  return getState().workLogs[ownerKey]?.main || EMPTY_WORK_DATA
}

/**
 * @param {string} ownerKey
 * @param {string} [logId]
 * @returns {Record<string, DayRecordLike>}
 */
export function readOwnerLogWorkData(ownerKey, logId = 'main') {
  if (!logId || logId === 'main') return readOwnerWorkData(ownerKey)
  return getState().workLogs[ownerKey]?.[logId] || EMPTY_WORK_DATA
}

/**
 * ownerKey의 workData를 store에서 직접 구독한다. app-store.js의
 * commitBatch/applyDomainToState는 관련 없는 커밋에서는 이 참조를 그대로 유지하므로
 * (불변 갱신 — 바뀐 도메인/ownerKey만 새 객체가 된다), useSyncExternalStore가
 * 요구하는 "변화 없으면 같은 참조" 조건을 그대로 만족한다.
 * @param {string} ownerKey
 * @returns {Record<string, DayRecordLike>}
 */
export function useOwnerWorkData(ownerKey) {
  return useSyncExternalStore(subscribe, () => readOwnerWorkData(ownerKey))
}

/**
 * 손익·계산서·미수용 logId→일지 맵(Step 9 슬라이스 C).
 * `workLogs[ownerKey]` 전체(main + 서브 차량번호)를 그대로 돌려준다 — 계산 엔진은
 * 이미 logId별 소스를 순회하므로, 여기만 main에 묶여 있으면 매출/미수에 기사가 안 잡힌다.
 * store 참조를 유지해 useSyncExternalStore 스냅샷이 안정적이다.
 * @param {string} ownerKey
 * @returns {import('../domain/financeTypes.js').WorkDataByLogId}
 */
export function readOwnerWorkDataByLogId(ownerKey) {
  const logs = getState().workLogs[ownerKey]
  if (!logs || typeof logs !== 'object') return EMPTY_WORK_DATA_BY_LOG_ID
  return logs
}

/** @param {string} ownerKey */
export function useOwnerWorkDataByLogId(ownerKey) {
  return useSyncExternalStore(subscribe, () => readOwnerWorkDataByLogId(ownerKey))
}

const EMPTY_TOMBSTONES = /** @type {import('../domain/workDataTombstones.js').WorkDataTombstones} */ ({})

/**
 * 재감사 3차(FAIL 지적 1번) — "아직 서버에 못 알린 빈 날 삭제" 목록을 읽는다.
 * lib/workData.js(원자적 커밋)와 lib/syncDeletedWorkDates.js(실제 원격 삭제)가
 * readOwnerWorkData와 같은 이유로 이 함수 하나를 공유한다 — 둘 다 React 컴포넌트가
 * 아니라 구독이 필요 없어 useX 훅은 따로 두지 않는다(이 값을 렌더에 쓰는 화면이
 * 아직 없다).
 * @param {string} ownerKey
 * @returns {import('../domain/workDataTombstones.js').WorkDataTombstones}
 */
export function readOwnerWorkDataTombstones(ownerKey) {
  const raw = /** @type {import('../domain/workDataTombstones.js').WorkDataTombstones|undefined} */ (getState().workDataDeletedDates[ownerKey])
  return raw || EMPTY_TOMBSTONES
}
