// @ts-check
// 차량 추가/수정. 서브 번호 변경 때 묶인 것 옮기기는 vehicleRename.js.
import { upsertCar } from '../domain/cars.js'
import { applyBusinessForm } from '../domain/carBusinessInfo.js'
import {
  assertSessionStillCurrent,
  blockedReasonForOwnerDataWrite,
  captureSession,
  getCloudOwnerKey,
  getCloudUserId,
} from './cloudSession.js'
import { commitBatch } from '../store/app-store.js'
import { planRenamedPlateEntries, planSubLogRename, renameSubVehicleOnServer } from './vehicleRename.js'
import { StaleSessionError } from './outboxErrors.js'
import { runOwnerSaveSerialized } from './ownerSaveQueue.js'
import { upsertVehicleFromList } from './syncVehiclesClients.js'
import { STORAGE_FAIL_TOAST } from './outboxCommit.js'

const SAVE_FAIL_TOAST = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'
const SESSION_CHANGED_TOAST = '로그인 정보가 바뀌어 저장하지 못했습니다. 다시 로그인한 뒤 시도해 주세요.'
const SAVED_TOAST = '저장했습니다.'

/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */

/**
 * @typedef {Object} CarSaveDraft
 * @property {string} [number]
 * @property {string} [tonnage]
 * @property {'main'|'sub'} [type]
 * @property {string} [driverName]
 * @property {string} [driverPhone]
 * @property {string} [driverPayMode]
 * @property {string} [driverSalaryAmount]
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
  /** @type {Array<import('../store/app-store.js').BatchEntry>} */
  let renameEntries = []
  if (previous?.type === 'sub' && saved?.type === 'sub' && previous.number && saved.number && previous.number !== saved.number) {
    const planned = planSubLogRename(ownerKey, previous.number, saved.number)
    if ('error' in planned) return { cars, toast: planned.error, failed: true, saved: null, renamedFrom: null }
    extraWrites = cloud ? [] : planned.extraWrites
    replaceWorkLogs = { ownerKey, next: planned.nextLogs }
    renamedFrom = previous.number
    afterPersist = planned.afterPersist
    renameEntries = planRenamedPlateEntries(ownerKey, previous.number, saved.number)
  }

  const okToast = editingId ? '차량을 수정했습니다.' : '차량을 등록했습니다.'
  if (cloud) {
    const cloudUserId = userId || getCloudUserId()
    return runOwnerSaveSerialized(ownerKey, async () => {
      try {
        const captured = captureSession()
        if (renamedFrom && saved?.number && previous?.supabaseId) await renameSubVehicleOnServer(previous.supabaseId, saved.number, captured)
        const remoteId = await upsertVehicleFromList(
          /** @type {string} */ (cloudUserId), ownerKey, nextCars, /** @type {string} */ (saved?.id), captured,
        )
        assertSessionStillCurrent(captured)
        const withId = remoteId != null
          ? nextCars.map((item) => (item.id === saved?.id ? { ...item, supabaseId: String(remoteId) } : item))
          : nextCars
        commitBatch([{ domain: 'cars', ownerKey, value: withId }, ...renameEntries], {
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
        // 서버가 정해 둔 거절(P0001, 예: 이미 등록된 차량번호)은 그 문구를 보여 준다.
        const serverReason = error && typeof error === 'object' && 'code' in error && error.code === 'P0001' && 'message' in error && typeof error.message === 'string' ? error.message : null
        return { cars, toast: serverReason || SAVE_FAIL_TOAST, failed: true, saved: null, renamedFrom: null }
      }
    })
  }

  try {
    commitBatch([{ domain: 'cars', ownerKey, value: nextCars }, ...renameEntries], { extraWrites, replaceWorkLogs })
    afterPersist()
    return { cars: nextCars, toast: okToast, failed: false, saved, renamedFrom }
  } catch (error) {
    console.error('[vehicleMutations] 차량 저장 실패:', error)
    return { cars, toast: STORAGE_FAIL_TOAST, failed: true, saved: null, renamedFrom: null }
  }
}

/**
 * 기사 관리 화면의 사업자·정산 계좌 저장 — requestVehicleSave와 같은 순서(차단 확인 → 로그인이면 서버 먼저 → 성공 후 commitBatch).
 * @param {{ ownerKey: string, cars: Array<CarLike>, carId: string, form: import('../domain/carBusinessInfo.js').CarBusinessForm, userId?: string|null }} params
 */
export async function requestCarBusinessInfoSave({ ownerKey, cars, carId, form, userId }) {
  const blocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (blocked) return { cars, toast: blocked, failed: true }
  if (!cars.some((item) => item.id === carId && item.type === 'sub')) {
    return { cars, toast: '차량을 찾지 못했습니다.', failed: true }
  }
  const nextCars = cars.map((item) => (item.id === carId ? applyBusinessForm(item, form) : item))
  if (getCloudOwnerKey() !== ownerKey) {
    try {
      commitBatch([{ domain: 'cars', ownerKey, value: nextCars }], { extraWrites: [] })
      return { cars: nextCars, toast: SAVED_TOAST, failed: false }
    } catch (error) {
      console.error('[vehicleMutations] 사업자정보 저장 실패:', error)
      return { cars, toast: STORAGE_FAIL_TOAST, failed: true }
    }
  }
  const cloudUserId = userId || getCloudUserId()
  return runOwnerSaveSerialized(ownerKey, async () => {
    try {
      const captured = captureSession()
      const remoteId = await upsertVehicleFromList(
        /** @type {string} */ (cloudUserId), ownerKey, nextCars, carId, captured,
      )
      assertSessionStillCurrent(captured)
      const withId = remoteId != null
        ? nextCars.map((item) => (item.id === carId ? { ...item, supabaseId: String(remoteId) } : item))
        : nextCars
      commitBatch([{ domain: 'cars', ownerKey, value: withId }], { extraWrites: [], syncToCloud: false })
      return { cars: withId, toast: SAVED_TOAST, failed: false }
    } catch (error) {
      if (error instanceof StaleSessionError) return { cars, toast: SESSION_CHANGED_TOAST, failed: true }
      console.error('[vehicleMutations] 사업자정보 저장 실패:', error)
      return { cars, toast: SAVE_FAIL_TOAST, failed: true }
    }
  })
}
