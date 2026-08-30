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
/** @typedef {import('../domain/expenseTypes.js').ExpenseItem} ExpenseItem */

const EMPTY_WORK_DATA = /** @type {Record<string, DayRecordLike>} */ ({})
// 재감사 2차(FAIL 지적 2번) — useExpenseForm.js가 마운트 시 한 번만 loadExpenses로
// 스냅샷을 뜨고 그 이후엔 다시 안 읽어서, 그 사이 다른 경로(hydrate, 다른 탭, 또는
// 같은 화면의 다른 조작)로 store에 반영된 항목이 다음 save()/remove()에서 통째로
// 덮여 사라지는 stale overwrite 버그가 있었다. useOwnerWorkData와 같은 패턴으로
// 고친다 — 화면은 항상 store를 직접 구독하고, 쓰기 직전에는(useDayDraft.js의
// readOwnerWorkData와 같은 자리) readOwnerExpenses로 한 번 더 최신값을 읽는다.
const EMPTY_EXPENSES = /** @type {Array<ExpenseItem>} */ ([])

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
 * store에서 ownerKey의 expenses(정비/주유/기타 비용 배열)를 읽는다 — 없으면 항상
 * 같은 EMPTY_EXPENSES 참조. useOwnerExpenses의 getSnapshot과 useExpenseForm.js의
 * save()/remove()(쓰기 직전 최신값 재확인)가 이 함수 하나를 공유한다 —
 * readOwnerWorkData와 정확히 같은 역할.
 * @param {string} ownerKey
 * @returns {Array<ExpenseItem>}
 */
export function readOwnerExpenses(ownerKey) {
  return getState().expenses[ownerKey] || EMPTY_EXPENSES
}

/**
 * ownerKey의 expenses를 store에서 직접 구독한다(재감사 2차 FAIL 지적 2번) —
 * useOwnerWorkData와 같은 이유(초기 렌더~구독 등록 사이 갱신 누락 방지)로
 * useSyncExternalStore를 쓴다.
 * @param {string} ownerKey
 * @returns {Array<ExpenseItem>}
 */
export function useOwnerExpenses(ownerKey) {
  return useSyncExternalStore(subscribe, () => readOwnerExpenses(ownerKey))
}

/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */

const EMPTY_CLIENTS = /** @type {Array<ClientLike>} */ ([])

/**
 * 재감사 3차(FAIL 지적 3번) — CalendarPage.jsx가 loadClients(ownerKey)로 렌더마다
 * 직접 읽던 것을 없애고, workData/expenses와 같은 방식으로 store를 구독하게 한다 —
 * 그래야 이 화면에서 고정노선 거래처의 fixedUnitPrice를 수정한 직후 같은 화면의
 * 달력 합계·매출 계산이 다시 렌더에서 최신값을 받는다(새로고침 없이).
 * @param {string} ownerKey
 * @returns {Array<ClientLike>}
 */
export function readOwnerClients(ownerKey) {
  return getState().clients[ownerKey] || EMPTY_CLIENTS
}

/**
 * @param {string} ownerKey
 * @returns {Array<ClientLike>}
 */
export function useOwnerClients(ownerKey) {
  return useSyncExternalStore(subscribe, () => readOwnerClients(ownerKey))
}

/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */
const EMPTY_CARS = /** @type {Array<CarLike>} */ ([])

/** @param {string} ownerKey */
export function readOwnerCars(ownerKey) {
  return getState().cars[ownerKey] || EMPTY_CARS
}

/** @param {string} ownerKey */
export function useOwnerCars(ownerKey) {
  return useSyncExternalStore(subscribe, () => readOwnerCars(ownerKey))
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
