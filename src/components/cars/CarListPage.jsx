// @ts-check
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ConfirmModal from '../ConfirmModal.jsx'
import CarFormModal from './CarFormModal.jsx'
import CarListItem from './CarListItem.jsx'
import { hasMainCar } from '../../lib/cars.js'
import { requestVehicleSave } from '../../lib/vehicleMutations.js'
import { requestVehicleDeletion } from '../../lib/directMutationActions.js'
import { getCloudUserId } from '../../lib/cloudSession.js'
import { todayWorkLogSelection } from '../../lib/calendar.js'
import { useOwnerCars } from '../../store/ownerDataHooks.js'

/**
 * @typedef {Object} CarFormDraft
 * @property {string} number
 * @property {string} tonnage
 * @property {'main'|'sub'} type
 * @property {string} driverName
 * @property {string} driverPhone
 * @property {string} settlementMode
 * @property {boolean} commEnabled
 * @property {string} commType
 * @property {string} commission
 */

/** @type {CarFormDraft} */
const emptyDraft = {
  number: '', tonnage: '', type: 'main', driverName: '', driverPhone: '',
  settlementMode: 'company', commEnabled: false, commType: 'percent', commission: '',
}
const DELETE_CAR_CONFIRM = '해당 차량을 삭제하시겠습니까? 이 차량으로 기록된 운행 내역도 함께 삭제되며 복구할 수 없습니다.'

function todayLogPath(/** @type {{ type?: string, number?: string }} */ car) {
  const dateKey = todayWorkLogSelection().dateKey
  if (car.type === 'sub' && car.number) return `/app/logs/${encodeURIComponent(car.number)}/day/${dateKey}`
  return `/app/day/${dateKey}`
}

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 */
export default function CarListPage({ ownerKey = 'guest', onBack, showToast }) {
  const cars = useOwnerCars(ownerKey)
  const navigate = useNavigate()
  const location = useLocation()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(/** @type {string|null} */ (null))
  const [draft, setDraft] = useState(emptyDraft)
  const [pendingDelete, setPendingDelete] = useState(/** @type {import('../../domain/financeTypes.js').CarLike|null} */ (null))

  function openAdd() {
    setEditingId(null)
    setDraft({ ...emptyDraft, type: hasMainCar(cars) ? 'sub' : 'main' })
    setModalOpen(true)
  }

  function openEdit(/** @type {import('../../domain/financeTypes.js').CarLike} */ car) {
    setEditingId(car.id || null)
    setDraft({
      number: car.number,
      tonnage: car.tonnage || '',
      type: car.type === 'sub' ? 'sub' : 'main',
      driverName: car.driverName || '',
      driverPhone: car.driverPhone || '',
      settlementMode: car.settlementMode && car.settlementMode !== 'default' ? car.settlementMode : 'company',
      commEnabled: !!car.commEnabled,
      commType: car.commType === 'direct' ? 'direct' : 'percent',
      commission: String(car.commission ?? ''),
    })
    setModalOpen(true)
  }

  function save() {
    const result = requestVehicleSave({ ownerKey, userId: getCloudUserId(), cars, draft, editingId })
    if (result.toast) showToast?.(result.toast)
    if (result.failed) return
    setModalOpen(false)
    if (result.renamedFrom && result.saved?.number) {
      const locState = location.state && typeof location.state === 'object'
        ? /** @type {{ fromLog?: { logId: string, dateKey: string } }} */ (location.state)
        : null
      const fromLog = locState?.fromLog
      if (fromLog && fromLog.logId === result.renamedFrom && fromLog.dateKey) {
        navigate(`/app/logs/${encodeURIComponent(result.saved.number)}/day/${fromLog.dateKey}`, { replace: true })
        return
      }
    }
    if (!editingId && result.saved) navigate(todayLogPath(result.saved))
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
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">차량 관리</div>
        <div style={{ width: 40 }}></div>
      </div>
      <div className="car-list">
        {cars.length === 0 && <div className="empty-state">등록된 차량이 없습니다.</div>}
        {cars.map((car, index) => (
          <CarListItem
            key={String(car.id || car.number || `car-${index}`)}
            car={car}
            onEdit={() => openEdit(car)}
            onDelete={() => setPendingDelete(car)}
          />
        ))}
      </div>
      <button type="button" className="management-add-fab" onClick={openAdd}>+ 추가</button>
      {modalOpen && (
        <CarFormModal draft={draft} setDraft={setDraft} editingId={editingId} onCancel={() => setModalOpen(false)} onSave={save} />
      )}
      {pendingDelete && (
        <ConfirmModal message={DELETE_CAR_CONFIRM} onCancel={() => setPendingDelete(null)} onConfirm={confirmRemove} />
      )}
    </div>
  )
}
