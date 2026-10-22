// commitBatch를 감싸는 단일 도메인 편의 함수들(로직 없는 얇은 래퍼).
import { commitBatch } from './app-store.ts'
import { storageKeyForLog } from './persist.ts'
import { dedupeCarsById } from '../../domain/cars.ts'
import { getCloudOwnerKey } from '../cloud/cloudSession.ts'
import type { DayRecordLike } from '../../domain/dayRecordTypes.ts'
import type { CarLike, FinanceSettings } from '../../domain/financeTypes.ts'
import type { ClientLike } from '../../domain/clientTypes.ts'
import type { ExpenseItem } from '../../domain/expenseTypes.ts'
import type { InvoiceLike } from '../../domain/financeTaxInvoiceEntries.ts'
import type { DriverRecord } from '../../domain/driverTypes.ts'
import type { LocalProfile as ProfileLike } from '../hydrate/hydrateMergeTypes.ts'
import type { DomainValue } from './app-store.ts'
import type { PersistDomain } from './persist.ts'
import type { JsonValue } from './atomicPersist.ts'

function commit<T extends DomainValue>(domain: PersistDomain, ownerKey: string, value: T): T {
  const [result] = commitBatch([{ domain, ownerKey, value }])
  // commitBatch는 entries 순서 그대로 각 값을 돌려준다(app-store.ts) — 여기선 항상
  // 방금 넘긴 그 T값 하나뿐이라, 넓어진 DomainValue를 원래 T로 좁혀 돌려준다.
  return (result) as T
}

/** @param data 날짜별 운행 기록 */
export function commitWorkData(ownerKey: string, data: Record<string, DayRecordLike>) {
  return commit('workData', ownerKey, data)
}

/**
 * 서브 차량 로컬 일지. 메인 workData 키는 건드리지 않고 storageKeyForLog만 쓴다.
 * 클라우드 예약은 하지 않는다.
 */
export function commitLogWorkData(ownerKey: string, logId: string, data: Record<string, DayRecordLike>) {
  if (!logId || logId === 'main') return commitWorkData(ownerKey, data)
  const jsonValue = (data) as JsonValue
  const cloud = getCloudOwnerKey() === ownerKey
  commitBatch([], {
    persist: !cloud,
    extraWrites: cloud ? [] : [{ key: storageKeyForLog(ownerKey, logId), value: jsonValue }],
    mergeWorkLogs: { ownerKey, extra: { [logId]: data } },
  })
  return data
}

export function commitCars(ownerKey: string, cars: Array<CarLike>) {
  return commit('cars', ownerKey, dedupeCarsById(cars))
}

export function commitClients(ownerKey: string, clients: Array<ClientLike>) {
  return commit('clients', ownerKey, clients)
}

/** @param settings 이미 normalizeSettings를 거친 값 */
export function commitSettings(ownerKey: string, settings: FinanceSettings) {
  return commit('settings', ownerKey, settings)
}

export function commitExpenses(ownerKey: string, items: Array<ExpenseItem>) {
  return commit('expenses', ownerKey, items)
}

export function commitInvoices(ownerKey: string, items: Array<InvoiceLike>) {
  return commit('invoices', ownerKey, items)
}

export function commitDrivers(ownerKey: string, items: Array<DriverRecord>) {
  return commit('drivers', ownerKey, items)
}

/** @param profile 이미 EMPTY_PROFILE과 병합된 값 */
export function commitProfile(ownerKey: string, profile: ProfileLike) {
  return commit('profile', ownerKey, profile)
}

/** 무시한 알림 id 목록. 로컬 전용 값이라 클라우드 동기화는 예약하지 않는다. */
export function commitDismissedNotifications(ownerKey: string, ids: Array<string>): Array<string> {
  return commit('dismissedNotifications', ownerKey, ids)
}
