// @ts-check
import { removeCar } from '../domain/cars.js'
import { blockedReasonForCloudWrite, blockedReasonForOwnerDataWrite, getSessionEpoch } from './cloudSession.js'
import { buildTombstoneOp } from './mutationOutbox.js'
import { commitLocalOnly, commitWithOutboxAndFlush } from './outboxCommit.js'
import { getState } from '../store/app-store.js'
import { readLogWorkData, storageKeyForLog } from '../store/persist.js'
import { planPendingLogDiscard } from './logPendingLifecycle.js'

/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */

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
  const op = buildTombstoneOp({ ownerKey, userId: userId || '', resourceType: 'vehicle', resourceId: String(car.supabaseId), operation: 'delete', sessionEpoch: getSessionEpoch() })
  const { toast, storageFailed } = await commitWithOutboxAndFlush({
    domain: 'cars', ownerKey, domainValue: nextCars, op,
    successToast: '차량을 삭제했습니다.',
    pendingToast: '차량 삭제 요청을 저장했습니다. 연결이 복구되면 자동으로 반영됩니다.',
    extraWrites, replaceWorkLogs,
  })
  if (!storageFailed) afterPersist()
  return { cars: storageFailed ? cars : nextCars, blocked: null, toast, failed: storageFailed, closeModal: !storageFailed }
}
