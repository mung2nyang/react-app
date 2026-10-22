// 화면들이 같은 store 값을 구독하는 훅 모음. useState+useEffect 구독은 첫 렌더~구독 등록 사이 갱신을 놓칠 수 있어
// useSyncExternalStore를 쓴다.
import { useMemo, useSyncExternalStore } from 'react'
import { getState, subscribe } from './app-store.ts'
import { normalizeSettings } from '../../domain/practiceSettings.ts'
import type { ExpenseItem } from '../../domain/expenseTypes.ts'
import type { ClientLike } from '../../domain/clientTypes.ts'
import type { InvoiceLike } from '../../domain/financeTaxInvoiceEntries.ts'
import type { CarLike } from '../../domain/financeTypes.ts'

// 쓰기 직전에는 readOwner*로 최신값을 다시 읽는다 — 옛 스냅샷으로 저장하면 그 사이 바뀐 항목을 덮어쓴다.
const EMPTY_EXPENSES = ([]) as Array<ExpenseItem>

/**
 * store에서 ownerKey의 expenses(정비/주유/기타 비용 배열)를 읽는다 — 없으면 항상
 * 같은 EMPTY_EXPENSES 참조. useOwnerExpenses의 getSnapshot과 useExpenseForm.js의
 * save()/remove()(쓰기 직전 최신값 재확인)가 이 함수 하나를 공유한다 —
 * readOwnerWorkData와 정확히 같은 역할.
 */
export function readOwnerExpenses(ownerKey: string): Array<ExpenseItem> {
  return getState().expenses[ownerKey] || EMPTY_EXPENSES
}

/** ownerKey의 expenses를 store에서 직접 구독한다. */
export function useOwnerExpenses(ownerKey: string): Array<ExpenseItem> {
  return useSyncExternalStore(subscribe, () => readOwnerExpenses(ownerKey))
}

const EMPTY_CLIENTS = ([]) as Array<ClientLike>

/** ownerKey의 clients를 구독한다 — 거래처 단가를 고친 직후 달력 합계가 새로고침 없이 바뀌게. */
export function readOwnerClients(ownerKey: string): Array<ClientLike> {
  return getState().clients[ownerKey] || EMPTY_CLIENTS
}

export function useOwnerClients(ownerKey: string): Array<ClientLike> {
  return useSyncExternalStore(subscribe, () => readOwnerClients(ownerKey))
}

const EMPTY_INVOICES = ([]) as Array<InvoiceLike>

export function readOwnerInvoices(ownerKey: string) {
  return getState().invoices[ownerKey] || EMPTY_INVOICES
}

export function useOwnerInvoices(ownerKey: string) {
  return useSyncExternalStore(subscribe, () => readOwnerInvoices(ownerKey))
}

const EMPTY_CARS = ([]) as Array<CarLike>

export function readOwnerCars(ownerKey: string) {
  return getState().cars[ownerKey] || EMPTY_CARS
}

export function useOwnerCars(ownerKey: string) {
  return useSyncExternalStore(subscribe, () => readOwnerCars(ownerKey))
}

/**
 * 쓰기·리포트 조립용. normalizeSettings는 호출마다 새 객체이므로
 * useSyncExternalStore getSnapshot 안에서는 쓰지 말 것.
 */
export function readOwnerSettings(ownerKey: string) {
  return normalizeSettings(getState().settings[ownerKey])
}

/**
 * ownerKey의 설정을 store에서 직접 구독하고 normalizeSettings를 거쳐 돌려준다.
 * normalizeSettings는 호출마다 새 객체를 만들므로 getSnapshot 안에서 직접 부르지
 * 않는다(그러면 관계없는 알림에도 매번 새 참조가 나와 React가 "getSnapshot 결과가
 * 캐시되지 않았다"고 판단해 무한 루프로 본다) — 원본(raw, 참조 안정적)만 구독하고
 * 정규화는 렌더 바디에서 useMemo로 한다.
 */
export function useOwnerSettings(ownerKey: string) {
  const raw = useSyncExternalStore(subscribe, () => getState().settings[ownerKey])
  return useMemo(() => normalizeSettings(raw), [raw])
}

export {
  readOwnerDrivers,
  readOwnerProfile,
  useOwnerDrivers,
  useOwnerProfile,
} from './ownerProfileDriversHooks.ts'

export {
  readOwnerDriverExpenses,
  useOwnerDriverExpenses,
} from './ownerDriverExpensesHooks.ts'

export {
  readOwnerWorkData,
  readOwnerLogWorkData,
  useOwnerWorkData,
  readOwnerWorkDataByLogId,
  useOwnerWorkDataByLogId,
  readOwnerWorkDataTombstones,
} from './ownerWorkDataHooks.ts'
