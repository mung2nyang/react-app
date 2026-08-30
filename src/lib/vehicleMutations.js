// @ts-check
// Step 7: 차량 추가/수정 + 서브 번호 변경 시 로컬 일지 키·pending 큐 이동.
import { upsertCar } from '../domain/cars.js'
import { blockedReasonForOwnerDataWrite } from './cloudSession.js'
import { commitBatch, getState } from '../store/app-store.js'
import { readLogWorkData, storageKeyForLog } from '../store/persist.js'
import { planPendingLogMove } from './logPendingLifecycle.js'
import { STORAGE_FAIL_TOAST } from './outboxCommit.js'

/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */
/** @typedef {import('../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */

/** @param {Record<string, DayRecordLike>|undefined} data */
function hasDates(data) {
  return !!(data && typeof data === 'object' && Object.keys(data).length)
}

/**
 * @param {string} ownerKey
 * @param {string} oldNumber
 * @param {string} newNumber
 * @returns {{ error: string } | { extraWrites: Array<import('../store/atomicPersist.js').KeyedWrite>, nextLogs: Record<string, Record<string, DayRecordLike>>, afterPersist: () => void }}
 */
function planSubLogRename(ownerKey, oldNumber, newNumber) {
  const fromRead = readLogWorkData(ownerKey, oldNumber)
  const toRead = readLogWorkData(ownerKey, newNumber)
  if (!fromRead.ok || !toRead.ok) {
    return { error: '운행 기록을 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.' }
  }
  const pending = planPendingLogMove(ownerKey, oldNumber, newNumber)
  if ('error' in pending) return pending
  const fromStore = getState().workLogs[ownerKey]?.[oldNumber]
  const toStore = getState().workLogs[ownerKey]?.[newNumber]
  const fromData = hasDates(fromStore) ? fromStore : fromRead.value
  const toData = hasDates(toStore) ? toStore : toRead.value
  if (hasDates(fromData) && hasDates(toData)) {
    return { error: '이미 그 번호의 운행 기록이 있습니다.' }
  }
  const moved = hasDates(fromData) ? fromData : (hasDates(toData) ? toData : {})
  const prev = getState().workLogs[ownerKey] || {}
  const nextLogs = { ...prev, [newNumber]: moved }
  delete nextLogs[oldNumber]
  const jsonMoved = /** @type {import('../store/atomicPersist.js').JsonValue} */ (moved)
  return {
    extraWrites: [
      { key: storageKeyForLog(ownerKey, newNumber), value: jsonMoved },
      { key: storageKeyForLog(ownerKey, oldNumber), remove: true },
      ...pending.extraWrites,
    ],
    nextLogs,
    afterPersist: pending.afterPersist,
  }
}

/**
 * @typedef {Object} CarSaveDraft
 * @property {string} [number]
 * @property {string} [tonnage]
 * @property {'main'|'sub'} [type]
 * @property {string} [driverName]
 * @property {string} [driverPhone]
 * @property {string} [settlementMode]
 * @property {boolean} [commEnabled]
 * @property {string} [commType]
 * @property {string} [commission]
 */

/**
 * @param {{ ownerKey: string, cars: Array<CarLike>, draft: CarSaveDraft, editingId: string|null, userId?: string|null }} params
 */
export function requestVehicleSave({ ownerKey, cars, draft, editingId, userId }) {
  const blocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (blocked) return { cars, toast: blocked, failed: true, saved: null, renamedFrom: null }
  const previous = editingId ? cars.find((item) => item.id === editingId) : null
  const result = upsertCar(cars, draft, editingId)
  if (result.error) return { cars, toast: result.error, failed: true, saved: null, renamedFrom: null }
  const nextCars = /** @type {Array<CarLike>} */ (result.cars)
  const saved = editingId
    ? nextCars.find((item) => item.id === editingId)
    : nextCars[nextCars.length - 1]
  /** @type {Array<import('../store/atomicPersist.js').KeyedWrite>} */
  let extraWrites = []
  /** @type {import('../store/app-store.js').WorkLogsReplace|undefined} */
  let replaceWorkLogs
  let renamedFrom = /** @type {string|null} */ (null)
  /** @type {() => void} */
  let afterPersist = () => {}
  if (previous?.type === 'sub' && saved?.type === 'sub' && previous.number && saved.number && previous.number !== saved.number) {
    const planned = planSubLogRename(ownerKey, previous.number, saved.number)
    if ('error' in planned) return { cars, toast: planned.error, failed: true, saved: null, renamedFrom: null }
    extraWrites = planned.extraWrites
    replaceWorkLogs = { ownerKey, next: planned.nextLogs }
    renamedFrom = previous.number
    afterPersist = planned.afterPersist
  }
  try {
    commitBatch([{ domain: 'cars', ownerKey, value: nextCars }], { extraWrites, replaceWorkLogs })
    afterPersist()
    return {
      cars: nextCars,
      toast: editingId ? '차량을 수정했습니다.' : '차량을 등록했습니다.',
      failed: false,
      saved,
      renamedFrom,
    }
  } catch (error) {
    console.error('[vehicleMutations] 차량 저장 실패:', error)
    return { cars, toast: STORAGE_FAIL_TOAST, failed: true, saved: null, renamedFrom: null }
  }
}
