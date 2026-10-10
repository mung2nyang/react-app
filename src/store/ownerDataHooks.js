// @ts-check
// 화면들이 같은 store 값을 구독하는 훅 모음. useState+useEffect 구독은 첫 렌더~구독 등록 사이 갱신을 놓칠 수 있어
// useSyncExternalStore를 쓴다.
import { useMemo, useSyncExternalStore } from 'react'
import { getState, subscribe } from './app-store.js'
import { normalizeSettings } from '../domain/practiceSettings.js'

/** @typedef {import('../domain/expenseTypes.js').ExpenseItem} ExpenseItem */

// 쓰기 직전에는 readOwner*로 최신값을 다시 읽는다 — 옛 스냅샷으로 저장하면 그 사이 바뀐 항목을 덮어쓴다.
const EMPTY_EXPENSES = /** @type {Array<ExpenseItem>} */ ([])

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
 * ownerKey의 expenses를 store에서 직접 구독한다.
 * @param {string} ownerKey
 * @returns {Array<ExpenseItem>}
 */
export function useOwnerExpenses(ownerKey) {
  return useSyncExternalStore(subscribe, () => readOwnerExpenses(ownerKey))
}

/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */

const EMPTY_CLIENTS = /** @type {Array<ClientLike>} */ ([])

/**
 * ownerKey의 clients를 구독한다 — 거래처 단가를 고친 직후 달력 합계가 새로고침 없이 바뀌게.
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

/** @typedef {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */
const EMPTY_INVOICES = /** @type {Array<InvoiceLike>} */ ([])

/** @param {string} ownerKey */
export function readOwnerInvoices(ownerKey) {
  return getState().invoices[ownerKey] || EMPTY_INVOICES
}

/** @param {string} ownerKey */
export function useOwnerInvoices(ownerKey) {
  return useSyncExternalStore(subscribe, () => readOwnerInvoices(ownerKey))
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

/**
 * 쓰기·리포트 조립용. normalizeSettings는 호출마다 새 객체이므로
 * useSyncExternalStore getSnapshot 안에서는 쓰지 말 것.
 * @param {string} ownerKey
 */
export function readOwnerSettings(ownerKey) {
  return normalizeSettings(getState().settings[ownerKey])
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

export {
  readOwnerDrivers,
  readOwnerProfile,
  useOwnerDrivers,
  useOwnerProfile,
} from './ownerProfileDriversHooks.js'

export {
  readOwnerDriverExpenses,
  useOwnerDriverExpenses,
} from './ownerDriverExpensesHooks.js'

export {
  readOwnerWorkData,
  readOwnerLogWorkData,
  useOwnerWorkData,
  readOwnerWorkDataByLogId,
  useOwnerWorkDataByLogId,
  readOwnerWorkDataTombstones,
} from './ownerWorkDataHooks.js'
