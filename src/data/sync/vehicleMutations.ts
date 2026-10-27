// 차량 추가/수정. 서브 번호 변경 때 묶인 것 옮기기는 vehicleRename.ts.
import { upsertCar } from '../../domain/cars.ts'
import { applyBusinessForm } from '../../domain/carBusinessInfo.ts'
import {
  assertSessionStillCurrent,
  blockedReasonForOwnerDataWrite,
  captureSession,
  getCloudOwnerKey,
  getCloudUserId,
} from '../cloud/cloudSession.ts'
import { commitBatch } from '../store/app-store.ts'
import { planRenamedPlateEntries, planSubLogRename, renameSubVehicleOnServer } from './vehicleRename.ts'
import { StaleSessionError } from './saveErrors.ts'
import { runOwnerSaveSerialized } from './ownerSaveQueue.ts'
import { upsertVehicleFromList } from './syncVehiclesClients.ts'
import { STORAGE_FAIL_TOAST } from './localCommit.ts'
import { SERVER_SAVE_FAIL, SESSION_CHANGED_FAIL } from '../../shared/utils/failureMessages.js'
import type { CarLike } from '../../domain/financeTypes.ts'
import type { CarBusinessForm } from '../../domain/carBusinessInfo.ts'
import type { KeyedWrite } from '../store/atomicPersist.ts'
import type { BatchEntry, WorkLogsReplace } from '../store/app-store.ts'

const SAVE_FAIL_TOAST = SERVER_SAVE_FAIL
const SESSION_CHANGED_TOAST = SESSION_CHANGED_FAIL
const SAVED_TOAST = '저장했습니다.'

export type CarSaveDraft = {
  number?: string
  tonnage?: string
  type?: 'main' | 'sub'
  driverName?: string
  driverPhone?: string
  driverPayMode?: string
  driverSalaryAmount?: string
  commEnabled?: boolean
  commType?: string
  commission?: string
}

export async function requestVehicleSave({ ownerKey, cars, draft, editingId, userId }: { ownerKey: string, cars: Array<CarLike>, draft: CarSaveDraft, editingId: string | null, userId?: string | null }) {
  const blocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (blocked) return { cars, toast: blocked, failed: true, saved: null, renamedFrom: null }
  const previous = editingId ? cars.find((item) => item.id === editingId) : null
  const result = upsertCar(cars, draft, editingId)
  if (result.error) return { cars, toast: result.error, failed: true, saved: null, renamedFrom: null }
  const nextCars = (result.cars) as Array<CarLike>
  const saved = editingId
    ? nextCars.find((item) => item.id === editingId)
    : nextCars[nextCars.length - 1]
  const cloud = getCloudOwnerKey() === ownerKey
  let extraWrites: Array<KeyedWrite> = []
  let replaceWorkLogs: WorkLogsReplace | undefined
  let renamedFrom = (null) as string | null
  let afterPersist: () => void = () => {}
  let renameEntries: Array<BatchEntry> = []
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
        const remoteId = renamedFrom && saved?.number && previous?.supabaseId
          ? await renameSubVehicleOnServer((cloudUserId) as string, previous.supabaseId, saved, nextCars.indexOf(saved), captured)
          : await upsertVehicleFromList((cloudUserId) as string, ownerKey, nextCars, (saved?.id) as string, captured)
        assertSessionStillCurrent(captured)
        const withId = remoteId != null
          ? nextCars.map((item) => (item.id === saved?.id ? { ...item, supabaseId: String(remoteId) } : item))
          : nextCars
        commitBatch([{ domain: 'cars', ownerKey, value: withId }, ...renameEntries], {
          extraWrites: [],
          replaceWorkLogs,
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

/** 기사 관리 화면의 사업자·정산 계좌 저장 — requestVehicleSave와 같은 순서(차단 확인 → 로그인이면 서버 먼저 → 성공 후 commitBatch). */
export async function requestCarBusinessInfoSave({ ownerKey, cars, carId, form, userId }: { ownerKey: string, cars: Array<CarLike>, carId: string, form: CarBusinessForm, userId?: string | null }) {
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
        (cloudUserId) as string, ownerKey, nextCars, carId, captured,
      )
      assertSessionStillCurrent(captured)
      const withId = remoteId != null
        ? nextCars.map((item) => (item.id === carId ? { ...item, supabaseId: String(remoteId) } : item))
        : nextCars
      commitBatch([{ domain: 'cars', ownerKey, value: withId }], { extraWrites: [] })
      return { cars: withId, toast: SAVED_TOAST, failed: false }
    } catch (error) {
      if (error instanceof StaleSessionError) return { cars, toast: SESSION_CHANGED_TOAST, failed: true }
      console.error('[vehicleMutations] 사업자정보 저장 실패:', error)
      return { cars, toast: SAVE_FAIL_TOAST, failed: true }
    }
  })
}
