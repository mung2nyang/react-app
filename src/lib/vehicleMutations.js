// @ts-check
// Step 7: 차량 추가/수정 + 서브 번호 변경 시 로컬 일지 키·pending 큐 이동.
import { upsertCar } from '../domain/cars.js'
import {
  assertSessionStillCurrent,
  blockedReasonForOwnerDataWrite,
  captureSession,
  getCloudOwnerKey,
  getCloudUserId,
} from './cloudSession.js'
import { commitBatch, getState } from '../store/app-store.js'
import { readLogWorkData, storageKeyForLog } from '../store/persist.js'
import { planPendingLogMove } from './logPendingLifecycle.js'
import { StaleSessionError } from './outboxErrors.js'
import { runOwnerSaveSerialized } from './ownerSaveQueue.js'
import { upsertVehicleFromList } from './syncVehiclesClients.js'
import { STORAGE_FAIL_TOAST } from './outboxCommit.js'

const SAVE_FAIL_TOAST = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'
const SESSION_CHANGED_TOAST = '세션이 바뀌어 저장을 중단했습니다. 다시 로그인한 뒤 시도해 주세요.'

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
export async function requestVehicleSave({ ownerKey, cars, draft, editingId, userId }) {
  const blocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (blocked) return { cars, toast: blocked, failed: true, saved: null, renamedFrom: null }
  const previous = editingId ? cars.find((item) => item.id === editingId) : null
  const result = upsertCar(cars, draft, editingId)
  if (result.error) return { cars, toast: result.error, failed: true, saved: null, renamedFrom: null }
  const nextCars = /** @type {Array<CarLike>} */ (result.cars)
  const saved = editingId
    ? nextCars.find((item) => item.id === editingId)
    : nextCars[nextCars.length - 1]
  const cloud = getCloudOwnerKey() === ownerKey
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
    extraWrites = cloud ? [] : planned.extraWrites
    replaceWorkLogs = { ownerKey, next: planned.nextLogs }
    renamedFrom = previous.number
    afterPersist = planned.afterPersist
  }

  const okToast = editingId ? '차량을 수정했습니다.' : '차량을 등록했습니다.'
  if (cloud) {
    const cloudUserId = userId || getCloudUserId()
    return runOwnerSaveSerialized(ownerKey, async () => {
      try {
        const captured = captureSession()
        const remoteId = await upsertVehicleFromList(
          /** @type {string} */ (cloudUserId), ownerKey, nextCars, /** @type {string} */ (saved?.id), captured,
        )
        assertSessionStillCurrent(captured)
        const withId = remoteId != null
          ? nextCars.map((item) => (item.id === saved?.id ? { ...item, supabaseId: String(remoteId) } : item))
          : nextCars
        commitBatch([{ domain: 'cars', ownerKey, value: withId }], {
          extraWrites: [],
          replaceWorkLogs,
          syncToCloud: false,
        })
        return { cars: withId, toast: okToast, failed: false, saved: withId.find((item) => item.id === saved?.id) || saved, renamedFrom }
      } catch (error) {
        if (error instanceof StaleSessionError) {
          return { cars, toast: SESSION_CHANGED_TOAST, failed: true, saved: null, renamedFrom: null }
        }
        console.error('[vehicleMutations] 차량 저장 실패:', error)
        return { cars, toast: SAVE_FAIL_TOAST, failed: true, saved: null, renamedFrom: null }
      }
    })
  }

  try {
    commitBatch([{ domain: 'cars', ownerKey, value: nextCars }], { extraWrites, replaceWorkLogs })
    afterPersist()
    return { cars: nextCars, toast: okToast, failed: false, saved, renamedFrom }
  } catch (error) {
    console.error('[vehicleMutations] 차량 저장 실패:', error)
    return { cars, toast: STORAGE_FAIL_TOAST, failed: true, saved: null, renamedFrom: null }
  }
}
