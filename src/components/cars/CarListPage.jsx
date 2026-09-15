// @ts-check
// 차량 목록·등록/수정·연동 해제 확인까지 한 화면 오케스트레이션(§6 응집).
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ConfirmModal from '../ConfirmModal.jsx'
import PageHeader from '../PageHeader.jsx'
import CarFormModal from './CarFormModal.jsx'
import CarListItem from './CarListItem.jsx'
import { hasMainCar, validateDriverLinkFields } from '../../lib/cars.js'
import { requestVehicleSave } from '../../lib/vehicleMutations.js'
import { requestDriverDeletion, requestVehicleDeletion } from '../../lib/directMutationActions.js'
import { getCloudUserId, isCloudSession } from '../../lib/cloudSession.js'
import { generateInviteCode } from '../../lib/drivers.js'
import { saveInviteAfterVehicle, todayIsoDate } from '../../lib/carInviteFromDraft.js'
import { useOwnerCars, useOwnerDrivers } from '../../store/ownerDataHooks.js'
import './car-management.css'

/**
 * @typedef {Object} CarFormDraft
 * @property {string} number
 * @property {string} tonnage
 * @property {'main'|'sub'} type
 * @property {string} driverName
 * @property {string} driverPhone
 * @property {string} driverPayMode
 * @property {string} driverSalaryAmount
 * @property {boolean} commEnabled
 * @property {string} commType
 * @property {string} commission
 * @property {string} inviteCode
 * @property {string} inviteStartDate
 * @property {string|null} inviteDriverId
 * @property {'link'|'log'} connectMode
 */

/** @type {CarFormDraft} */
const emptyDraft = {
  number: '', tonnage: '', type: 'main', driverName: '', driverPhone: '',
  driverPayMode: 'revenue', driverSalaryAmount: '', commEnabled: false, commType: 'percent', commission: '',
  inviteCode: '', inviteStartDate: '', inviteDriverId: null, connectMode: 'log',
}
const DELETE_CAR_CONFIRM = '해당 차량을 삭제하시겠습니까? 이 차량으로 기록된 운행 내역도 함께 삭제되며 복구할 수 없습니다.'
const DISCONNECT_CONFIRM = '이 차량의 기사 연동을 해제하시겠습니까? 해제하면 되돌릴 수 없습니다.'

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {import('../../lib/outboxTypes.js').AppSession|null} [props.session]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function CarListPage({ ownerKey = 'guest', session = null, onBack, showToast, onOpenMenu }) {
  const cars = useOwnerCars(ownerKey)
  const drivers = useOwnerDrivers(ownerKey)
  const navigate = useNavigate()
  const location = useLocation()
  const viewerIsEmployedDriver = session?.accountType === 'employed_driver'
  const cloud = isCloudSession(session) || !!getCloudUserId()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(/** @type {string|null} */ (null))
  const [draft, setDraft] = useState(emptyDraft)
  const [pendingDelete, setPendingDelete] = useState(/** @type {import('../../domain/financeTypes.js').CarLike|null} */ (null))
  const [pendingDisconnect, setPendingDisconnect] = useState(false)

  function openAdd() {
    setEditingId(null)
    const type = hasMainCar(cars) ? 'sub' : 'main'
    setDraft({
      ...emptyDraft,
      type,
      inviteCode: type === 'sub' && cloud ? generateInviteCode(drivers) : '',
      inviteStartDate: todayIsoDate(),
    })
    setModalOpen(true)
  }

  function openEdit(/** @type {import('../../domain/financeTypes.js').CarLike} */ car) {
    setEditingId(car.id || null)
    const linked = drivers.find((d) => d.vehicleNumber === car.number)
    setDraft({
      number: car.number,
      tonnage: car.tonnage || '',
      type: car.type === 'sub' ? 'sub' : 'main',
      driverName: car.driverName || linked?.name || '',
      driverPhone: car.driverPhone || linked?.phone || '',
      driverPayMode: car.driverPayMode || 'revenue',
      driverSalaryAmount: car.driverSalaryAmount != null ? String(car.driverSalaryAmount) : '',
      commEnabled: !!car.commEnabled,
      commType: car.commType === 'direct' ? 'direct' : 'percent',
      commission: String(car.commission ?? ''),
      inviteCode: linked?.inviteCode || (car.type === 'sub' && cloud ? generateInviteCode(drivers) : ''),
      inviteStartDate: linked?.startDate || todayIsoDate(),
      inviteDriverId: linked?.id || null,
      connectMode: linked ? 'link' : 'log',
    })
    setModalOpen(true)
  }

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

  /** @param {Array<import('../../lib/outboxTypes.js').DriverRecord>} driversNow */
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
    setModalOpen(false)
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

  return (
    <div className="page car-management-page">
      <PageHeader title="차량 관리" onBack={onBack} onOpenMenu={onOpenMenu} />
      <div className="car-list">
        {cars.length === 0 && <div className="empty-state">등록된 차량이 없습니다.</div>}
        {cars.map((car, index) => (
          <CarListItem
            key={String(car.id || car.number || `car-${index}`)}
            car={car}
            drivers={drivers}
            assignedView={viewerIsEmployedDriver}
            readOnly={viewerIsEmployedDriver}
            onEdit={() => openEdit(car)}
            onDelete={() => setPendingDelete(car)}
          />
        ))}
      </div>
      {!viewerIsEmployedDriver && (
        <button type="button" className="management-add-fab" onClick={openAdd}>+ 추가</button>
      )}
      {modalOpen && (
        <CarFormModal
          draft={draft}
          setDraft={setDraft}
          editingId={editingId}
          onCancel={() => { setPendingDisconnect(false); setModalOpen(false) }}
          onSave={save}
          cloud={cloud}
          drivers={drivers}
        />
      )}
      {pendingDelete && (
        <ConfirmModal message={DELETE_CAR_CONFIRM} onCancel={() => setPendingDelete(null)} onConfirm={confirmRemove} />
      )}
      {pendingDisconnect && (
        <ConfirmModal
          message={DISCONNECT_CONFIRM}
          onCancel={() => setPendingDisconnect(false)}
          onConfirm={confirmDisconnect}
        />
      )}
    </div>
  )
}
