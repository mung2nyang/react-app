// @ts-check
// 로그인 사용자의 기사 초대 생성·수정을 outbox·재시도 큐 없이 upsert_driver_link_idempotent RPC 1회로 저장한다 — 성공하면 Store 갱신,
// 실패하면 토스트만 띄우고 중단. 차량·시작일이 없으면 저장하지 않는다(원본과 같음). 같은 차량번호 1명 규칙은 upsertDriver가 저장 전에 본다.
// 세션은 RPC 전에 캡처하고 각 await 직후·Store 반영 직전에 재검증한다 — 바뀌었으면 부작용 없이 조용히 중단.
/** @typedef {import('./outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {import('./outboxTypes.js').CarRecord} CarRecord */
/** @typedef {import('./outboxTypes.js').DriverLinkRow} DriverLinkRow */
import { assertCloudWriteReady, assertSessionStillCurrent, captureSession, getCloudUserId } from './cloudSession.js'
import { commitCars, commitDrivers } from '../store/commitHelpers.js'
import { readOwnerCars } from '../store/ownerDataHooks.js'
import { runOwnerSaveSerialized } from './ownerSaveQueue.js'
import { upsertVehicleFromList } from './syncVehiclesClients.js'
import { StaleSessionError } from './outboxErrors.js'
import {
  driverLinkRowNeedsUpdate,
  updateDriverLinkFields,
  upsertDriverLinkViaRpc,
} from './driverLinkRpc.js'

const SAVE_FAIL_TOAST = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'
const SESSION_CHANGED_MESSAGE = '로그인 정보가 바뀌어 저장하지 못했습니다. 다시 로그인한 뒤 시도해 주세요.'
const MISSING_FIELDS_MESSAGE = '기사 이름, 배정 차량, 시작일을 입력해 주세요.'
const UNKNOWN_CAR_MESSAGE = '등록된 기사 차량 번호를 입력해 주세요.'
const UNSYNCED_CAR_MESSAGE = '선택한 차량이 아직 저장되지 않았습니다. 잠시 후 다시 시도해 주세요.'
const CAR_DRIVER_FAIL_MESSAGE = '초대는 저장했지만 차량의 기사 이름·전화번호는 저장하지 못했습니다. 잠시 후 다시 저장해 주세요.'

/**
 * 서버가 확정한 행을 해당 로컬 driver 항목에 반영한다(순수).
 * @param {Array<DriverRecord>} items
 * @param {number} idx
 * @param {DriverLinkRow} row
 * @returns {Array<DriverRecord>}
 */
function applyServerRow(items, idx, row) {
  return items.map((item, i) => (i === idx
    ? { ...item, supabaseId: row.id, inviteCode: row.invite_code || item.inviteCode }
    : item))
}

/**
 * 초대 이름·전화번호를 그 차량 기사 정보에도 — 불러올 때 차량 값이 먼저라 안 바꾸면 다시 켤 때 되돌아간다(원본과 같음).
 * 이미 같으면 저장하지 않는다. 서버 성공 뒤에만 화면에 반영한다.
 * @param {string} ownerKey @param {string} carId @param {DriverRecord} driver
 * @param {import('./outboxTypes.js').SessionCapture} captured
 * @returns {Promise<boolean>} 차량 저장이 필요 없거나 성공하면 true
 */
function saveCarDriverInfo(ownerKey, carId, driver, captured) {
  const name = driver.name || ''
  const phone = driver.phone || ''
  return runOwnerSaveSerialized(ownerKey, async () => {
    const cars = readOwnerCars(ownerKey)
    const current = cars.find((item) => item.id === carId)
    if (!current || ((current.driverName || '') === name && (current.driverPhone || '') === phone)) return true
    const nextCars = cars.map((item) => (item.id === carId ? { ...item, driverName: name, driverPhone: phone } : item))
    try {
      await upsertVehicleFromList(/** @type {string} */ (getCloudUserId()), ownerKey, nextCars, carId, captured)
      assertSessionStillCurrent(captured)
      commitCars(ownerKey, nextCars, { syncToCloud: false })
      return true
    } catch (error) {
      console.error('[requestDriverInviteSave] 차량 기사 정보 저장 실패:', error)
      return false
    }
  })
}

/**
 * @param {{ ownerKey: string, userId?: string, items: Array<DriverRecord>, editingId: string|null,
 *   cars?: Array<CarRecord>, previousItems?: Array<DriverRecord> }} params
 * @returns {Promise<{ items: Array<DriverRecord>, blocked: string|null, toast: string|null }>}
 */
export async function requestDriverInviteSave({ ownerKey, items, editingId, cars }) {
  const foundIdx = items.findIndex((item) => item.id === editingId)
  const idx = foundIdx >= 0 ? foundIdx : items.length - 1
  const driver = items[idx]

  if (!driver?.vehicleNumber || !driver.startDate) {
    return { items, blocked: MISSING_FIELDS_MESSAGE, toast: MISSING_FIELDS_MESSAGE }
  }

  /** @type {string|null} */
  let blocked = null
  try { assertCloudWriteReady() } catch (error) { blocked = error instanceof Error ? error.message : String(error) }
  if (blocked) return { items, blocked, toast: blocked }

  const car = (cars || []).find((item) => item.number === driver.vehicleNumber)
  if (!car) return { items, blocked: UNKNOWN_CAR_MESSAGE, toast: UNKNOWN_CAR_MESSAGE }
  // 배정 차량이 아직 서버에 없다 — 차량 동기화 큐를 새로 돌리지 않고 즉시 중단.
  if (!car.supabaseId) return { items, blocked: UNSYNCED_CAR_MESSAGE, toast: UNSYNCED_CAR_MESSAGE }

  const vehicleId = String(car.supabaseId)
  const inviteCode = driver.inviteCode || ''
  const assignmentStart = driver.startDate
  const assignmentEnd = driver.endDate || null
  const captured = captureSession()

  try {
    /** @type {DriverLinkRow} */
    let row
    if (driver.supabaseId) {
      // 이미 서버에 있는 초대의 수정 — RPC(멱등 키가 다른 레거시 행이면 중복 insert
      // 위험)를 쓰지 않고 그 행을 직접 1회 update한다.
      row = await updateDriverLinkFields({
        supabaseId: driver.supabaseId, vehicleId, inviteCode, assignmentStart, assignmentEnd,
      })
      assertSessionStillCurrent(captured)
    } else {
      row = await upsertDriverLinkViaRpc({
        idempotencyKey: driver.id, vehicleId, inviteCode, assignmentStart, assignmentEnd,
      })
      assertSessionStillCurrent(captured)
      // RPC가 기존 행(응답 유실 재시도)을 no-op으로 돌려줬는데 그 사이 기간/코드를
      // 바꿨다면, 그 행을 직접 1회 update해 수정 필드를 반영한다.
      if (driverLinkRowNeedsUpdate(row, { inviteCode, assignmentStart, assignmentEnd })) {
        row = await updateDriverLinkFields({
          supabaseId: row.id, vehicleId, inviteCode, assignmentStart, assignmentEnd,
        })
        assertSessionStillCurrent(captured)
      }
    }

    const nextItems = applyServerRow(items, idx, row)
    commitDrivers(ownerKey, nextItems, { syncToCloud: false })
    const carSaved = await saveCarDriverInfo(ownerKey, car.id, driver, captured)
    return {
      items: nextItems,
      blocked: null,
      toast: !carSaved ? CAR_DRIVER_FAIL_MESSAGE : editingId ? '기사 배정 정보를 수정했습니다.' : '기사 초대를 저장했습니다.',
    }
  } catch (error) {
    if (error instanceof StaleSessionError) {
      return { items, blocked: null, toast: SESSION_CHANGED_MESSAGE }
    }
    console.error('[requestDriverInviteSave] 저장 실패:', error)
    return { items, blocked: SAVE_FAIL_TOAST, toast: SAVE_FAIL_TOAST }
  }
}
