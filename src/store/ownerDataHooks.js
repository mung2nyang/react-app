// @ts-check
// Step 5(달력 홈 재작성) 재감사 4번: CalendarPage와 MainPageRoute(WorkLogPage 입력)가
// 화면마다 따로 `useState(() => loadWorkData(...))`/`useState(() => loadPracticeSettings(...))`
// 스냅샷을 만들던 것을 없애고, 이 훅 하나로 둘 다 같은 store 값을 구독하게 한다 —
// 단일 진실 공급원. `useSyncExternalStore`를 쓰는 이유: `useState`(초기값) +
// `useEffect(() => subscribe(...))`(이후 갱신) 조합은 "초기 렌더에서 store를 읽은
// 시점"과 "구독을 실제로 등록한 시점" 사이에 store가 바뀌면 그 갱신을 놓칠 수 있다
// (effect는 렌더 이후에야 실행된다). `useSyncExternalStore`는 그 두 시점을 React가
// 직접 맞춰 줘서 이 허점이 구조적으로 없다.
import { useMemo, useSyncExternalStore } from 'react'
import { getState, subscribe } from './app-store.js'
import { normalizeSettings } from '../domain/practiceSettings.js'

/** @typedef {import('../domain/calendarBadges.js').DayRecordLike} DayRecordLike */

const EMPTY_WORK_DATA = /** @type {Record<string, DayRecordLike>} */ ({})

/**
 * store에서 ownerKey의 workData(state.workLogs[ownerKey].main)를 읽는다 — 없으면
 * 항상 같은 EMPTY_WORK_DATA 참조를 돌려준다(고정 상수라 매번 새 객체가 아니다).
 * useOwnerWorkData의 getSnapshot과 MainPageRoute.jsx의 saveDay(최신값을 커밋
 * 직전에 다시 읽을 때)가 이 함수 하나를 공유한다.
 * @param {string} ownerKey
 * @returns {Record<string, DayRecordLike>}
 */
export function readOwnerWorkData(ownerKey) {
  // app-store.js의 AppStoreState 타입은 아직 // @ts-check가 없는 파일에 있어
  // workLogs[ownerKey].main을 일부러 느슨한 object로 선언해 뒀다(모든 도메인
  // 슬라이스를 한 타입으로 묶어야 해서다) — 실제 런타임 모양(day-record.js의
  // saveDayRecord가 만드는 dateKey→DayRecordLike 맵)으로 여기서 좁혀 준다.
  const raw = /** @type {Record<string, DayRecordLike>|undefined} */ (getState().workLogs[ownerKey]?.main)
  return raw || EMPTY_WORK_DATA
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
 * ownerKey의 설정을 store에서 직접 구독하고 normalizeSettings를 거쳐 돌려준다.
 * normalizeSettings는 호출마다 새 객체를 만들므로 getSnapshot 안에서 직접 부르지
 * 않는다(그러면 관계없는 알림에도 매번 새 참조가 나와 React가 "getSnapshot 결과가
 * 캐시되지 않았다"고 판단해 무한 루프로 본다) — 원본(raw, 참조 안정적)만 구독하고
 * 정규화는 렌더 바디에서 useMemo로 한다.
 * @param {string} ownerKey
 */
export function useOwnerSettings(ownerKey) {
  const raw = useSyncExternalStore(subscribe, () => getState().settings[ownerKey])
  return useMemo(() => normalizeSettings(raw), [raw])
}
