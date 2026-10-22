// 컴포넌트가 부르는 고수준 서비스 함수 — readiness 게이트 → 서버에 직접 1회 → 성공했을 때만 Store 갱신(Fail-Fast, outbox·재시도 큐 없음), 실패면 토스트만.
// 차량 삭제는 vehicleDeletion.ts, 기사 초대는 requestDriverInviteSave.ts, 공용 커밋은 localCommit.ts.
import { removeClient } from '../../domain/clients.ts'
import { removeDriver, setDriverStatus } from '../../domain/drivers.ts'
import {
  assertSessionStillCurrent,
  blockedReasonForCloudWrite,
  blockedReasonForOwnerDataWrite,
  captureSession,
} from '../cloud/cloudSession.ts'
import { commitLocalOnly } from './localCommit.ts'
import {
  deleteClientFromSupabase,
  deleteDriverLinkOnSupabase,
  updateDriverLinkStatusOnSupabase,
} from './directMutations.ts'
import { StaleSessionError } from './saveErrors.ts'
import { commitClients, commitDrivers } from '../store/commitHelpers.ts'
import { SERVER_SAVE_FAIL, SESSION_CHANGED_FAIL } from '../../shared/utils/failureMessages.js'
import type { ClientLike } from '../../domain/clientTypes.ts'
import type { DriverRecord } from '../../domain/driverTypes.ts'

export { requestDriverInviteSave } from './requestDriverInviteSave.ts'
export { requestVehicleDeletion } from './vehicleDeletion.ts'

// 공통 문구. 다른 도메인 outbox의 STORAGE_FAIL_TOAST는 건드리지 않는다.
const SAVE_FAIL_TOAST = SERVER_SAVE_FAIL
const SESSION_CHANGED_TOAST = SESSION_CHANGED_FAIL

/** 로그인 사용자의 거래처 삭제. outbox/tombstone 없이 clients.delete 직접 1회. */
export async function requestClientDeletion({ ownerKey, userId, clients, clientId }: { ownerKey: string, userId: string | null, clients: Array<ClientLike>, clientId: string }): Promise<{ clients: Array<ClientLike>, blocked: string | null, toast: string | null, failed: boolean, closeModal: boolean }> {
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
    commitClients(ownerKey, nextClients)
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
 * 로그인 사용자의 기사 연동 상태변경. outbox 없이 driver_links.update 직접 1회.
 * 게스트/로컬 전용(supabaseId 없음)은 로컬 목록만 바꾼다.
 */
export async function requestDriverStatusChange({ ownerKey, drivers, driverId, status, cloud }: { ownerKey: string, userId: string | null, drivers: Array<DriverRecord>, driverId: string, status: 'pending' | 'linked', cloud: boolean }): Promise<{ drivers: Array<DriverRecord>, blocked: string | null, toast: string }> {
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
    commitDrivers(ownerKey, nextDrivers)
    return { drivers: nextDrivers, blocked: null, toast: statusToast }
  } catch (error) {
    if (error instanceof StaleSessionError) return { drivers, blocked: null, toast: SESSION_CHANGED_TOAST }
    console.error('[requestDriverStatusChange] 상태변경 실패:', error)
    return { drivers, blocked: SAVE_FAIL_TOAST, toast: SAVE_FAIL_TOAST }
  }
}

/**
 * 로그인 사용자의 기사 초대 삭제. outbox 없이 driver_links.delete 직접 1회.
 * 게스트/로컬 전용(supabaseId 없음)은 로컬 목록에서만 제거한다.
 */
export async function requestDriverDeletion({ ownerKey, drivers, driverId, cloud }: { ownerKey: string, userId?: string | null, drivers: Array<DriverRecord>, driverId: string, cloud: boolean }): Promise<{ drivers: Array<DriverRecord>, blocked: string | null, toast: string | null | undefined }> {
  const driver = drivers.find((item) => item.id === driverId)
  if (!cloud || !driver?.supabaseId) {
    const { value, toast, failed } = commitLocalOnly({ domain: 'drivers', ownerKey, value: removeDriver(drivers, driverId), successToast: '초대를 삭제했습니다.' })
    if (failed || value === undefined) return { drivers, blocked: null, toast }
    return { drivers: value, blocked: null, toast }
  }
  const blocked = blockedReasonForCloudWrite(driver.supabaseId)
  if (blocked) return { drivers, blocked, toast: blocked }

  const nextDrivers = removeDriver(drivers, driverId)
  const captured = captureSession()
  try {
    await deleteDriverLinkOnSupabase(driver.supabaseId, captured)
    assertSessionStillCurrent(captured)
    commitDrivers(ownerKey, nextDrivers)
    return { drivers: nextDrivers, blocked: null, toast: '초대를 삭제했습니다.' }
  } catch (error) {
    if (error instanceof StaleSessionError) return { drivers, blocked: null, toast: SESSION_CHANGED_TOAST }
    console.error('[requestDriverDeletion] 삭제 실패:', error)
    return { drivers, blocked: SAVE_FAIL_TOAST, toast: SAVE_FAIL_TOAST }
  }
}
