// @ts-check
// 슬라이스 A (보리 승인, 2026-08-31 / 2026-09-01 보완): 로그인 사용자의 기사 초대
// 생성/수정(차량·기간이 있어 서버에 올려야 하는 경우)을 mutation outbox / durable /
// fallback / 재시도 큐에 넣지 않고 upsert_driver_link_idempotent RPC를 클라이언트가
// 직접 1회 호출한다. 성공하면 Store의 drivers를 갱신하고, 실패하면 지정 토스트만
// 띄우고 즉시 중단한다(Fail-Fast). 게스트/불완전 입력은 로컬만 저장한다.
//
// 기간 겹침 서버 조회는 보리 지시로 제거했다 — "같은 차량번호 1명" 규칙은
// domain/drivers.js upsertDriver가 저장 전에 본다(페이지에서 먼저 호출).
//
// 세션 무효화(AGENTS §9): RPC를 시작하기 전에 세션을 캡처하고, 각 await 직후와
// Store 반영 직전에 재검증한다 — 그 사이 로그아웃/owner 전환이 있었으면 로컬/원격
// 부작용을 남기지 않고 조용히 중단한다.
/** @typedef {import('./outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {import('./outboxTypes.js').CarRecord} CarRecord */
/** @typedef {import('./outboxTypes.js').DriverLinkRow} DriverLinkRow */
import { assertCloudWriteReady, assertSessionStillCurrent, captureSession } from './cloudSession.js'
import { commitLocalOnly } from './outboxCommit.js'
import { commitDrivers } from '../store/commitHelpers.js'
import { StaleSessionError } from './outboxErrors.js'
import {
  driverLinkRowNeedsUpdate,
  updateDriverLinkFields,
  upsertDriverLinkViaRpc,
} from './driverLinkRpc.js'

const SAVE_FAIL_TOAST = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'
const SESSION_CHANGED_MESSAGE = '세션이 바뀌어 저장을 중단했습니다. 다시 로그인한 뒤 시도해 주세요.'

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
 * @param {{ ownerKey: string, userId?: string, items: Array<DriverRecord>, editingId: string|null,
 *   cars?: Array<CarRecord>, previousItems?: Array<DriverRecord> }} params
 * @returns {Promise<{ items: Array<DriverRecord>, blocked: string|null, toast: string|null }>}
 */
export async function requestDriverInviteSave({ ownerKey, items, editingId, cars }) {
  const foundIdx = items.findIndex((item) => item.id === editingId)
  const idx = foundIdx >= 0 ? foundIdx : items.length - 1
  const driver = items[idx]

  if (!driver?.vehicleNumber || !driver.startDate) {
    // 사용자 지시 2번: 차량/기간이 아직 안 정해졌으면 클라우드 시도만 건너뛰고
    // 로컬 편집은 게스트와 동일하게 저장한다(게스트 JSON 백업과 충돌하지 않는다).
    const successToast = editingId ? '초대를 수정했습니다.' : '초대를 저장했습니다.'
    const { value, toast, failed } = commitLocalOnly({ domain: 'drivers', ownerKey, value: items, successToast })
    return { items: failed ? items : /** @type {Array<DriverRecord>} */ (value), blocked: null, toast }
  }

  /** @type {string|null} */
  let blocked = null
  try { assertCloudWriteReady() } catch (error) { blocked = error instanceof Error ? error.message : String(error) }
  if (blocked) return { items, blocked, toast: blocked }

  const car = (cars || []).find((item) => item.number === driver.vehicleNumber)
  if (!car || !car.supabaseId) {
    // 배정 차량이 아직 서버에 동기화되지 않았다 — 차량 동기화 큐를 새로 돌리지 않고 즉시 중단.
    return { items, blocked: SAVE_FAIL_TOAST, toast: SAVE_FAIL_TOAST }
  }

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
    return {
      items: nextItems,
      blocked: null,
      toast: editingId ? '기사 할당 정보를 수정했습니다.' : '기사 초대를 저장했습니다.',
    }
  } catch (error) {
    if (error instanceof StaleSessionError) {
      return { items, blocked: null, toast: SESSION_CHANGED_MESSAGE }
    }
    console.error('[requestDriverInviteSave] 저장 실패:', error)
    return { items, blocked: SAVE_FAIL_TOAST, toast: SAVE_FAIL_TOAST }
  }
}
