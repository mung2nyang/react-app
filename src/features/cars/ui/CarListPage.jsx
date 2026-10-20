// @ts-check
// 차량 목록·등록/수정 창 — 그리기와 창 열기만, 저장·연동 해제·삭제 흐름은 useCarListActions.
import { useState } from 'react'
import ConfirmModal from '../../../shared/ui/ConfirmModal.jsx'
import PageHeader from '../../../shared/ui/PageHeader.jsx'
import CarFormModal from './CarFormModal.jsx'
import CarListItem from './CarListItem.jsx'
import useCarListActions from '../hooks/useCarListActions.js'
import { hasMainCar } from '../../../lib/cars.js'
import { NEW_DRIVER_INCOME_DRAFT, driverIncomeDraftFromCar } from '../../../domain/driverIncomeDeductions.js'
import { resolveDriverShareBase } from '../../../domain/driverShareBase.js'
import { getCloudUserId, isCloudSession } from '../../../data/cloud/cloudSession.js'
import { generateInviteCode } from '../../../lib/drivers.js'
import { todayIsoDate } from '../api/carInviteFromDraft.js'
import { useOwnerCars, useOwnerDrivers } from '../../../data/store/ownerDataHooks.js'
import './car-management.css'

/** @typedef {import('./CarFormModal.jsx').CarFormDraft} CarFormDraft */

/** @type {CarFormDraft} */
const emptyDraft = {
  number: '', tonnage: '', type: 'main', driverName: '', driverPhone: '',
  driverPayMode: 'revenue', driverSalaryAmount: '', commEnabled: false, commType: 'percent', commission: '',
  ...NEW_DRIVER_INCOME_DRAFT, driverShareBase: 'gross',
  inviteCode: '', inviteStartDate: '', inviteDriverId: null, connectMode: 'log',
}
const DELETE_CAR_CONFIRM = '이 차량의 운행 기록도 함께 지워지며 되돌릴 수 없습니다.'
const DISCONNECT_CONFIRM = '연동 중인 기사에게는 해제 요청이 가고, 기사가 동의하거나 3일이 지나면 해제됩니다.'

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {import('../../../data/sync/syncTypes.js').AppSession|null} [props.session]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function CarListPage({ ownerKey = 'guest', session = null, onBack, showToast, onOpenMenu }) {
  const cars = useOwnerCars(ownerKey)
  const drivers = useOwnerDrivers(ownerKey)
  const viewerIsEmployedDriver = session?.accountType === 'employed_driver'
  const cloud = isCloudSession(session) || !!getCloudUserId()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(/** @type {string|null} */ (null))
  const [draft, setDraft] = useState(emptyDraft)
  const actions = useCarListActions({ ownerKey, cars, drivers, cloud, draft, editingId, showToast, closeModal: () => setModalOpen(false) })

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

  function openEdit(/** @type {import('../../../domain/financeTypes.js').CarLike} */ car) {
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
      ...driverIncomeDraftFromCar(car), driverShareBase: resolveDriverShareBase(car),
      inviteCode: linked?.inviteCode || (car.type === 'sub' && cloud ? generateInviteCode(drivers) : ''),
      inviteStartDate: linked?.startDate || todayIsoDate(),
      inviteDriverId: linked?.id || null,
      connectMode: linked ? 'link' : 'log',
    })
    setModalOpen(true)
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
            onDelete={() => actions.askDelete(car)}
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
          onCancel={() => { actions.cancelDisconnect(); setModalOpen(false) }}
          onSave={actions.save}
          cloud={cloud}
          drivers={drivers}
        />
      )}
      {actions.pendingDelete && (
        <ConfirmModal title="이 차량을 삭제하시겠습니까?" message={DELETE_CAR_CONFIRM} confirmLabel="삭제" danger onCancel={actions.cancelDelete} onConfirm={actions.confirmRemove} />
      )}
      {actions.pendingDisconnect && (
        <ConfirmModal
          title="이 차량의 기사 연동을 해제하시겠습니까?"
          message={DISCONNECT_CONFIRM}
          confirmLabel="연동 해제"
          danger
          onCancel={actions.cancelDisconnect}
          onConfirm={actions.confirmDisconnect}
        />
      )}
    </div>
  )
}
