// @ts-check
// 차량 저장·연동 해제·삭제 흐름 — 서버 요청 순서와 알림 문구는 화면에서 옮긴 그대로.
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { validateDriverLinkFields } from '../../lib/cars.js'
import { requestVehicleSave } from '../../lib/vehicleMutations.js'
import { requestDriverDeletion, requestVehicleDeletion } from '../../lib/directMutationActions.js'
import { requestDriverUnlinkAction } from '../../lib/driverUnlink.js'
import { getCloudUserId } from '../../data/cloud/cloudSession.js'
import { saveInviteAfterVehicle } from '../../lib/carInviteFromDraft.js'

/** @typedef {import('./CarFormModal.jsx').CarFormDraft} CarFormDraft */
/** @typedef {import('../../domain/financeTypes.js').CarLike} CarLike */
/** @typedef {import('../../lib/outboxTypes.js').DriverRecord} DriverRecord */

/**
 * @param {{ ownerKey: string, cars: Array<CarLike>, drivers: Array<DriverRecord>, cloud: boolean, draft: CarFormDraft, editingId: string|null, showToast?: (message: string) => void, closeModal: () => void }} params
 */
export default function useCarListActions({ ownerKey, cars, drivers, cloud, draft, editingId, showToast, closeModal }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [pendingDelete, setPendingDelete] = useState(/** @type {CarLike|null} */ (null))
  const [pendingDisconnect, setPendingDisconnect] = useState(false)

  /** @returns {string|null} */
  function linkedDriverIdForDraft() {
    if (draft.inviteDriverId) return draft.inviteDriverId
    return drivers.find((d) => d.vehicleNumber === draft.number)?.id || null
  }

  async function save() {
    if (cloud && draft.type === 'sub' && draft.connectMode === 'link') {
      const err = validateDriverLinkFields(draft.driverName, draft.driverPhone)
      if (err) { showToast?.(err); return }
    }
    if (editingId && draft.connectMode === 'log' && linkedDriverIdForDraft()) {
      setPendingDisconnect(true)
      return
    }
    await commitSave(drivers)
  }

  async function confirmDisconnect() {
    const driverId = linkedDriverIdForDraft()
    if (!driverId) {
      setPendingDisconnect(false)
      await commitSave(drivers)
      return
    }
    // 연동 중이면 바로 끊지 않고 해제 요청 — 동의·3일 전까지 연동 유지라 차량은 미연동으로 저장하지 않는다.
    if (drivers.find((d) => d.id === driverId)?.status === 'linked') {
      const req = await requestDriverUnlinkAction({ ownerKey, drivers, driverId, action: 'request' })
      showToast?.(req.toast)
      setPendingDisconnect(false)
      if (!req.failed) closeModal()
      return
    }
    const del = await requestDriverDeletion({
      ownerKey,
      userId: getCloudUserId(),
      drivers,
      driverId,
      cloud,
    })
    if (del.blocked) {
      showToast?.(del.blocked)
      setPendingDisconnect(false)
      return
    }
    if (del.drivers.some((d) => d.id === driverId)) {
      showToast?.(del.toast || '연동을 해제하지 못했습니다.')
      setPendingDisconnect(false)
      return
    }
    setPendingDisconnect(false)
    await commitSave(del.drivers)
  }

  /** @param {Array<DriverRecord>} driversNow */
  async function commitSave(driversNow) {
    const inviteSnapshot = { ...draft }
    const result = await requestVehicleSave({ ownerKey, userId: getCloudUserId(), cars, draft, editingId })
    if (result.failed) {
      if (result.toast) showToast?.(result.toast)
      return
    }
    const skipInvite = inviteSnapshot.connectMode === 'log'
    const inviteToast = await saveInviteAfterVehicle({
      cloud,
      ownerKey,
      userId: getCloudUserId() ?? '',
      drivers: driversNow,
      cars,
      saved: result.saved,
      inviteDraft: inviteSnapshot,
      skipInvite,
    })
    if (inviteToast && inviteToast !== result.toast) showToast?.(inviteToast)
    else if (result.toast) showToast?.(result.toast)
    closeModal()
    if (result.renamedFrom && result.saved?.number) {
      const locState = location.state && typeof location.state === 'object'
        ? /** @type {{ fromLog?: { logId: string, dateKey: string } }} */ (location.state)
        : null
      const fromLog = locState?.fromLog
      if (fromLog && fromLog.logId === result.renamedFrom && fromLog.dateKey) {
        navigate(`/app/logs/${encodeURIComponent(result.saved.number)}/day/${fromLog.dateKey}`, { replace: true })
      }
    }
  }

  async function confirmRemove() {
    const car = pendingDelete
    if (!car?.id) return
    const result = await requestVehicleDeletion({ ownerKey, userId: getCloudUserId(), cars, vehicleId: car.id })
    if (result.toast) showToast?.(result.toast)
    if (result.failed || result.closeModal === false) return
    setPendingDelete(null)
  }

  return {
    save,
    confirmDisconnect,
    cancelDisconnect: () => setPendingDisconnect(false),
    pendingDisconnect,
    askDelete: (/** @type {CarLike} */ car) => setPendingDelete(car),
    cancelDelete: () => setPendingDelete(null),
    confirmRemove,
    pendingDelete,
  }
}
