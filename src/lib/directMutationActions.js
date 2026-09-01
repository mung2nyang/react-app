// @ts-check
// 컴포넌트가 부르는 고수준 서비스 함수들 — 컴포넌트는 이 함수들만 호출하고, 여기서
// readiness 게이트 → 원격 mutation → 결과 토스트까지 처리한다.
//
// 슬라이스 A(기사 초대) · B(기사 상태변경/삭제) · C(차량·거래처 삭제)는 mutation outbox /
// tombstone / durable / 재시도 큐를 쓰지 않는다: readiness 후 서버에 직접 1회 쓰고,
// 성공했을 때만 Store를 갱신한다(Fail-Fast). 실패하면 Store/LS/outbox를 더 쌓지 않고
// 지정 토스트만 띄운다. 차량 삭제는 vehicleDeletion.js.
//
// 공용 커밋 프리미티브는 outboxCommit.js, 기사 초대는 requestDriverInviteSave.js에 있다.
import { removeClient } from '../domain/clients.js'
import { removeDriver, setDriverStatus } from '../domain/drivers.js'
import {
  assertSessionStillCurrent,
  blockedReasonForCloudWrite,
  blockedReasonForOwnerDataWrite,
  captureSession,
} from './cloudSession.js'
import { commitLocalOnly } from './outboxCommit.js'
import {
  deleteClientFromSupabase,
  deleteDriverLinkOnSupabase,
  updateDriverLinkStatusOnSupabase,
} from './directMutations.js'
import { StaleSessionError } from './outboxErrors.js'
import { commitClients, commitDrivers } from '../store/commitHelpers.js'

export { requestDriverInviteSave } from './requestDriverInviteSave.js'
export { requestVehicleDeletion } from './vehicleDeletion.js'

// 슬라이스 A~C 공통 문구. 다른 도메인 outbox의 STORAGE_FAIL_TOAST는 건드리지 않는다.
const SAVE_FAIL_TOAST = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'
const SESSION_CHANGED_TOAST = '세션이 바뀌어 저장을 중단했습니다. 다시 로그인한 뒤 시도해 주세요.'

/**
 * 로그인 사용자의 거래처 삭제. 슬라이스 C: outbox/tombstone 없이 clients.delete 직접 1회.
 * @param {{ ownerKey: string, userId: string|null, clients: Array<import('../domain/clientTypes.js').ClientLike>, clientId: string }} params
 */
export async function requestClientDeletion({ ownerKey, userId, clients, clientId }) {
  const ownerBlocked = blockedReasonForOwnerDataWrite({ ownerKey, userId })
  if (ownerBlocked) return { clients, blocked: ownerBlocked, toast: ownerBlocked, failed: true, closeModal: false }
  const client = clients.find((item) => item.id === clientId)
  if (!client) return { clients, blocked: null, toast: null, failed: true, closeModal: false }
  if (!client.supabaseId) {
    const { value, toast, failed } = commitLocalOnly({ domain: 'clients', ownerKey, value: removeClient(clients, clientId), successToast: '거래처를 삭제했습니다.' })
    return { clients: failed ? clients : value, blocked: null, toast, failed, closeModal: !failed }
  }
  const blocked = blockedReasonForCloudWrite(client.supabaseId)
  if (blocked) return { clients, blocked, toast: blocked, failed: true, closeModal: false }

  const nextClients = removeClient(clients, clientId)
  const captured = captureSession()
  try {
    await deleteClientFromSupabase(client.supabaseId, captured)
    assertSessionStillCurrent(captured)
    commitClients(ownerKey, nextClients, { syncToCloud: false })
    return { clients: nextClients, blocked: null, toast: '거래처를 삭제했습니다.', failed: false, closeModal: true }
  } catch (error) {
    if (error instanceof StaleSessionError) {
      return { clients, blocked: null, toast: SESSION_CHANGED_TOAST, failed: true, closeModal: false }
    }
    console.error('[requestClientDeletion] 삭제 실패:', error)
    return { clients, blocked: SAVE_FAIL_TOAST, toast: SAVE_FAIL_TOAST, failed: true, closeModal: false }
  }
}

/**
 * 로그인 사용자의 기사 연동 상태변경. 슬라이스 B: outbox 없이 driver_links.update 직접 1회.
 * 게스트/로컬 전용(supabaseId 없음)은 로컬 목록만 바꾼다.
 * @param {{ ownerKey: string, userId: string|null, drivers: Array<import('./outboxTypes.js').DriverRecord>, driverId: string, status: 'pending'|'linked', cloud: boolean }} params
 */
export async function requestDriverStatusChange({ ownerKey, drivers, driverId, status, cloud }) {
  const driver = drivers.find((item) => item.id === driverId)
  const statusToast = status === 'linked' ? '연동 중으로 바꿨습니다.' : '대기 상태로 바꿨습니다.'
  if (!cloud || !driver?.supabaseId) {
    const { value, toast, failed } = commitLocalOnly({ domain: 'drivers', ownerKey, value: setDriverStatus(drivers, driverId, status), successToast: statusToast })
    return { drivers: failed ? drivers : value, blocked: null, toast }
  }
  const blocked = blockedReasonForCloudWrite(driver.supabaseId)
  if (blocked) return { drivers, blocked, toast: blocked }

  const nextDrivers = setDriverStatus(drivers, driverId, status)
  const captured = captureSession()
  try {
    await updateDriverLinkStatusOnSupabase(driver.supabaseId, status, captured)
    assertSessionStillCurrent(captured)
    commitDrivers(ownerKey, nextDrivers, { syncToCloud: false })
    return { drivers: nextDrivers, blocked: null, toast: statusToast }
  } catch (error) {
    if (error instanceof StaleSessionError) return { drivers, blocked: null, toast: SESSION_CHANGED_TOAST }
    console.error('[requestDriverStatusChange] 상태변경 실패:', error)
    return { drivers, blocked: SAVE_FAIL_TOAST, toast: SAVE_FAIL_TOAST }
  }
}

/**
 * 로그인 사용자의 기사 초대 삭제. 슬라이스 B: outbox 없이 driver_links.delete 직접 1회.
 * 게스트/로컬 전용(supabaseId 없음)은 로컬 목록에서만 제거한다.
 * @param {{ ownerKey: string, userId: string|null, drivers: Array<import('./outboxTypes.js').DriverRecord>, driverId: string, cloud: boolean }} params
 */
export async function requestDriverDeletion({ ownerKey, drivers, driverId, cloud }) {
  const driver = drivers.find((item) => item.id === driverId)
  if (!cloud || !driver?.supabaseId) {
    const { value, toast, failed } = commitLocalOnly({ domain: 'drivers', ownerKey, value: removeDriver(drivers, driverId), successToast: '초대를 삭제했습니다.' })
    return { drivers: failed ? drivers : value, blocked: null, toast }
  }
  const blocked = blockedReasonForCloudWrite(driver.supabaseId)
  if (blocked) return { drivers, blocked, toast: blocked }

  const nextDrivers = removeDriver(drivers, driverId)
  const captured = captureSession()
  try {
    await deleteDriverLinkOnSupabase(driver.supabaseId, captured)
    assertSessionStillCurrent(captured)
    commitDrivers(ownerKey, nextDrivers, { syncToCloud: false })
    return { drivers: nextDrivers, blocked: null, toast: '초대를 삭제했습니다.' }
  } catch (error) {
    if (error instanceof StaleSessionError) return { drivers, blocked: null, toast: SESSION_CHANGED_TOAST }
    console.error('[requestDriverDeletion] 삭제 실패:', error)
    return { drivers, blocked: SAVE_FAIL_TOAST, toast: SAVE_FAIL_TOAST }
  }
}
