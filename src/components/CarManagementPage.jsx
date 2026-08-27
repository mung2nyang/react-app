// Step 0-4 감사 보완 4차: 삭제 오케스트레이션(readiness 게이트 → 원자적 로컬+outbox
// 저장 → 즉시 flush → 토스트)을 lib/directMutationActions.js로 뺐다(사용자 지시 6번 —
// UI handler가 아니라 순수 서비스 함수가 실제 호출 경로를 갖고, 그 함수를 테스트한다).
// 폼 모달도 CarFormModal.jsx로 분리했다(200줄 제한).
import { useState } from 'react'
import ConfirmModal from './ConfirmModal.jsx'
import CarFormModal from './CarFormModal.jsx'
import { hasMainCar, loadCars, saveCars, upsertCar } from '../lib/cars.js'
import { requestVehicleDeletion } from '../lib/directMutationActions.js'
import { getCloudUserId } from '../lib/cloudSession.js'

const emptyDraft = {
  number: '', tonnage: '', type: 'main', driverName: '', driverPhone: '',
  settlementMode: 'company', commEnabled: false, commType: 'percent', commission: '',
}
const DELETE_CAR_CONFIRM = '해당 차량을 삭제하시겠습니까? 이 차량으로 기록된 운행 내역도 함께 삭제되며 복구할 수 없습니다.'

export default function CarManagementPage({ ownerKey = 'guest', onBack, showToast }) {
  const [cars, setCars] = useState(() => loadCars(ownerKey))
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [pendingDelete, setPendingDelete] = useState(null)

  function openAdd() {
    setEditingId(null)
    setDraft({ ...emptyDraft, type: hasMainCar(cars) ? 'sub' : 'main' })
    setModalOpen(true)
  }

  function openEdit(car) {
    setEditingId(car.id)
    setDraft({
      number: car.number,
      tonnage: car.tonnage || '',
      type: car.type,
      driverName: car.driverName || '',
      driverPhone: car.driverPhone || '',
      settlementMode: car.settlementMode && car.settlementMode !== 'default' ? car.settlementMode : 'company',
      commEnabled: !!car.commEnabled,
      commType: car.commType === 'direct' ? 'direct' : 'percent',
      commission: car.commission || '',
    })
    setModalOpen(true)
  }

  function save() {
    const result = upsertCar(cars, draft, editingId)
    if (result.error) {
      showToast?.(result.error)
      return
    }
    // 감사 보완 4차 재작업(사용자 지시 1번): 삭제 오케스트레이션을 outbox 경로로 뺄 때
    // 이 저장(추가/수정) 경로의 saveCars 호출을 실수로 빠뜨렸다 — setCars만 하고
    // localStorage에 안 써서 새로고침하면 방금 추가/수정한 차량이 사라지는 회귀였다.
    setCars(result.cars)
    saveCars(ownerKey, result.cars)
    setModalOpen(false)
    showToast?.(editingId ? '차량을 수정했습니다.' : '차량을 등록했습니다.')
  }

  function remove(id) {
    const car = cars.find((item) => item.id === id)
    if (!car) return
    setPendingDelete(car)
  }

  async function confirmRemove() {
    const car = pendingDelete
    if (!car) return
    setPendingDelete(null)
    const result = await requestVehicleDeletion({ ownerKey, userId: getCloudUserId(), cars, vehicleId: car.id })
    setCars(result.cars)
    if (result.toast) showToast?.(result.toast)
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
        {cars.map((car) => (
          <div key={car.id} className="management-list-card">
            <div className="management-card-copy">
              <div className="car-info-text">
                <span className={`management-badge ${car.type === 'main' ? 'main' : 'sub'}`}>
                  {car.type === 'main' ? '메인' : '기사차량'}
                </span>
                {car.number}
              </div>
              {car.tonnage && <div className="car-sub-text">({car.tonnage})</div>}
              {car.type === 'sub' && car.driverName && (
                <div className="car-sub-text">{car.driverName} · {car.driverPhone || '-'}</div>
              )}
            </div>
            <div className="car-action-btns">
              <button type="button" className="action-icon-btn" onClick={() => openEdit(car)}>수정</button>
              <button type="button" className="action-icon-btn del" onClick={() => remove(car.id)}>삭제</button>
            </div>
          </div>
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
