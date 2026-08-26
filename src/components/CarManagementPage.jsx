import { useState } from 'react'
import ConfirmModal from './ConfirmModal.jsx'
import {
  getSettlementModeMeta,
  hasMainCar,
  loadCars,
  removeCar,
  saveCars,
  SETTLEMENT_MODES,
  upsertCar,
} from '../lib/cars.js'
import { deleteVehicleFromSupabase } from '../lib/cloudSync.js'
import { formatPhoneNumber } from '../lib/formatPhone.js'
import { formatCurrencyInput, formatPercentInput } from '../lib/money.js'

const emptyDraft = {
  number: '',
  tonnage: '',
  type: 'main',
  driverName: '',
  driverPhone: '',
  settlementMode: 'company',
  commEnabled: false,
  commType: 'percent',
  commission: '',
}
const DELETE_CAR_CONFIRM = '해당 차량을 삭제하시겠습니까? 이 차량으로 기록된 운행 내역도 함께 삭제되며 복구할 수 없습니다.'

export default function CarManagementPage({ ownerKey = 'guest', onBack, showToast }) {
  const [cars, setCars] = useState(() => loadCars(ownerKey))
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [pendingDelete, setPendingDelete] = useState(null)

  function persist(next) {
    setCars(next)
    saveCars(ownerKey, next)
  }

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
    persist(result.cars)
    setModalOpen(false)
    showToast?.(editingId ? '차량을 수정했습니다.' : '차량을 등록했습니다.')
  }

  function remove(id) {
    const car = cars.find((item) => item.id === id)
    if (!car) return
    setPendingDelete(car)
  }

  function confirmRemove() {
    const car = pendingDelete
    if (!car) return
    persist(removeCar(cars, car.id))
    setPendingDelete(null)
    showToast?.('차량을 삭제했습니다.')
    if (car.supabaseId) {
      deleteVehicleFromSupabase(car.supabaseId).catch((error) => {
        console.error('서버 차량 삭제 실패(로컬 삭제는 반영됨, 다음 동기화 때 재확인 필요):', error)
      })
    }
  }

  function setCommType(nextType) {
    setDraft((prev) => ({
      ...prev,
      commType: nextType,
      commission: prev.commType === nextType ? prev.commission : '',
    }))
  }

  function onCommissionChange(value) {
    setDraft((prev) => ({
      ...prev,
      commission: prev.commType === 'direct' ? formatCurrencyInput(value) : formatPercentInput(value),
    }))
  }

  const isSub = draft.type === 'sub'
  const settlementMeta = getSettlementModeMeta(draft.settlementMode)

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
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content car-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              {editingId
                ? (isSub ? '기사 정보 수정' : '차량 수정')
                : (isSub ? '기사 등록' : '차량 등록')}
            </div>
            <div className="form-group">
              <label htmlFor="newCarNumber">차량번호</label>
              <input
                id="newCarNumber"
                className="input-box"
                placeholder="12가 3456"
                value={draft.number}
                onChange={(e) => setDraft({ ...draft, number: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="newCarTonnage">차량 톤수</label>
              <input
                id="newCarTonnage"
                className="input-box"
                placeholder="예: 5톤, 11톤, 25톤"
                value={draft.tonnage}
                onChange={(e) => setDraft({ ...draft, tonnage: e.target.value })}
              />
            </div>
            {isSub && (
              <>
                <div className="form-group">
                  <label htmlFor="newDriverName">기사명</label>
                  <input
                    id="newDriverName"
                    className="input-box"
                    placeholder="기사명을 입력하세요"
                    value={draft.driverName}
                    onChange={(e) => setDraft({ ...draft, driverName: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="newUserPhone">연락처</label>
                  <input
                    id="newUserPhone"
                    className="input-box"
                    type="tel"
                    placeholder="010-0000-0000"
                    value={draft.driverPhone}
                    onChange={(e) => setDraft({ ...draft, driverPhone: formatPhoneNumber(e.target.value) })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="newCarSettlementMode">계산서 처리 방식</label>
                  <select
                    id="newCarSettlementMode"
                    className="input-box"
                    value={draft.settlementMode}
                    onChange={(e) => setDraft({ ...draft, settlementMode: e.target.value })}
                  >
                    {SETTLEMENT_MODES.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                  <p className="car-settlement-mode-guide">{settlementMeta.description}</p>
                </div>
                <div className="setting-item">
                  <div className="car-option-copy">
                    <label htmlFor="newCarCommToggle">기사(차량) 수수료 적용</label>
                    <p>정산 시 이 차량(기사)에게서 공제할 수수료를 설정합니다.</p>
                  </div>
                  <label className="switch">
                    <input
                      id="newCarCommToggle"
                      type="checkbox"
                      checked={draft.commEnabled}
                      onChange={(e) => setDraft({ ...draft, commEnabled: e.target.checked })}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
                {draft.commEnabled && (
                  <div className="car-commission-panel">
                    <div className="car-commission-heading">
                      <strong>기사(차량) 수수료 입력</strong>
                      <span>정산 시 설정한 방식으로 자동 계산됩니다.</span>
                    </div>
                    <div className="car-commission-type" role="group" aria-label="기사(차량) 수수료 입력 방식">
                      <button
                        type="button"
                        className={draft.commType === 'percent' ? 'active' : ''}
                        aria-pressed={draft.commType === 'percent'}
                        onClick={() => setCommType('percent')}
                      >
                        <span>%</span> 비율
                      </button>
                      <button
                        type="button"
                        className={draft.commType === 'direct' ? 'active' : ''}
                        aria-pressed={draft.commType === 'direct'}
                        onClick={() => setCommType('direct')}
                      >
                        <span>₩</span> 금액
                      </button>
                    </div>
                    <label className="car-commission-value" htmlFor="newCarCommission">
                      <span>{draft.commType === 'direct' ? '기사(차량) 건당 수수료' : '기사(차량) 수수료율'}</span>
                      <span className="car-commission-input">
                        <input
                          id="newCarCommission"
                          inputMode={draft.commType === 'direct' ? 'numeric' : 'decimal'}
                          placeholder="0"
                          value={draft.commission}
                          onChange={(e) => onCommissionChange(e.target.value)}
                        />
                        <b>{draft.commType === 'direct' ? '원' : '%'}</b>
                      </span>
                    </label>
                  </div>
                )}
              </>
            )}
            <p className="car-type-hint">
              {isSub ? '기사 차량으로 등록됩니다. (기사 연동은 나중에)' : '메인 차량으로 등록됩니다.'}
            </p>
            <div className="modal-btns">
              <button type="button" className="modal-btn cancel" onClick={() => setModalOpen(false)}>취소</button>
              <button type="button" className="modal-btn confirm" onClick={save}>저장</button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          message={DELETE_CAR_CONFIRM}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmRemove}
        />
      )}
    </div>
  )
}
