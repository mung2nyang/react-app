// @ts-check
// 슬라이스 C(2026-09-01): 로그인 사용자의 차량 삭제를 mutation outbox / tombstone /
// 재시도 큐 없이 deleteVehicleFromSupabase 직접 1회로 끝낸다(Fail-Fast). 성공했을
// 때만 Store(cars + 서브 일지 키)를 원자적으로 반영하고, 실패하면 로컬을 건드리지
// 않고 지정 토스트만 띄운다. supabaseId 없는 로컬 전용 차량은 예전처럼 commitLocalOnly.
import { removeCar } from '../domain/cars.js'
import {
  assertSessionStillCurrent,
  blockedReasonForCloudWrite,
  blockedReasonForOwnerDataWrite,
  captureSession,
} from './cloudSession.js'
import { commitLocalOnly } from './outboxCommit.js'
import { commitBatch, getState } from '../store/app-store.js'
import { readLogWorkData, storageKeyForLog } from '../store/persist.js'
import { planPendingLogDiscard } from './logPendingLifecycle.js'
import { deleteVehicleFromSupabase } from './directMutations.js'
import { StaleSessionError } from './outboxErrors.js'

/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */

const SAVE_FAIL_TOAST = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'
const SESSION_CHANGED_TOAST = '세션이 바뀌어 저장을 중단했습니다. 다시 로그인한 뒤 시도해 주세요.'

/**
 * @param {{ ownerKey: string, userId: string|null, cars: Array<CarLike>, vehicleId: string }} params
 */
export async function requestVehicleDeletion({ ownerKey, userId, cars, vehicleId }) {
  const ownerBlocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (ownerBlocked) return { cars, blocked: ownerBlocked, toast: ownerBlocked, failed: true, closeModal: false }
  const car = cars.find((item) => item.id === vehicleId)
  if (!car) return { cars, blocked: null, toast: null, failed: true, closeModal: false }

  /** @type {Array<import('../store/atomicPersist.js').KeyedWrite>} */
  const extraWrites = []
  /** @type {() => void} */
  let afterPersist = () => {}
  if (car.type === 'sub' && car.number) {
    const logRead = readLogWorkData(ownerKey, car.number)
    if (!logRead.ok) {
      return { cars, blocked: null, toast: '운행 기록을 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.', failed: true, closeModal: false }
    }
    const pending = planPendingLogDiscard(ownerKey, car.number)
    if ('error' in pending) return { cars, blocked: null, toast: pending.error, failed: true, closeModal: false }
    extraWrites.push({ key: storageKeyForLog(ownerKey, car.number), remove: true }, ...pending.extraWrites)
    afterPersist = pending.afterPersist
  }
  const logs = getState().workLogs[ownerKey] || {}
  const nextLogs = { ...logs }
  if (car.type === 'sub' && car.number) delete nextLogs[car.number]
  const replaceWorkLogs = car.type === 'sub' && car.number ? { ownerKey, next: nextLogs } : undefined

  if (!car.supabaseId) {
    const { value, toast, failed } = commitLocalOnly({
      domain: 'cars', ownerKey, value: removeCar(cars, vehicleId), successToast: '차량을 삭제했습니다.', extraWrites, replaceWorkLogs,
    })
    if (!failed) afterPersist()
    return { cars: failed ? cars : value, blocked: null, toast, failed, closeModal: !failed }
  }

  const blocked = blockedReasonForCloudWrite(car.supabaseId)
  if (blocked) return { cars, blocked, toast: blocked, failed: true, closeModal: false }

  const nextCars = removeCar(cars, vehicleId)
  const captured = captureSession()
  try {
    await deleteVehicleFromSupabase(car.supabaseId, captured)
    assertSessionStillCurrent(captured)
    // 서버 삭제 성공 뒤에만 로컬(cars + 서브 일지 키)을 원자적으로 반영한다.
    // syncToCloud/outbox 없음 — 서버 쓰기는 이미 끝났다.
    commitBatch([{ domain: 'cars', ownerKey, value: nextCars }], { syncToCloud: false, extraWrites, replaceWorkLogs })
    afterPersist()
    return { cars: nextCars, blocked: null, toast: '차량을 삭제했습니다.', failed: false, closeModal: true }
  } catch (error) {
    if (error instanceof StaleSessionError) {
      return { cars, blocked: null, toast: SESSION_CHANGED_TOAST, failed: true, closeModal: false }
    }
    console.error('[requestVehicleDeletion] 삭제 실패:', error)
    return { cars, blocked: SAVE_FAIL_TOAST, toast: SAVE_FAIL_TOAST, failed: true, closeModal: false }
  }
}
