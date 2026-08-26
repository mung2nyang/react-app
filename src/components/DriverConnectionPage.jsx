import { useState } from 'react'
import { loadCars } from '../lib/cars.js'
import {
  blockedReasonForCloudWrite,
  deleteDriverLinkOnSupabase,
  isCloudSession,
  saveDriverInviteToCloud,
  updateDriverLinkStatusOnSupabase,
} from '../lib/cloudSync.js'
import { countByStatus, generateInviteCode, loadDrivers, removeDriver, saveDrivers, setDriverStatus, upsertDriver } from '../lib/drivers.js'
import { formatPhoneNumber } from '../lib/formatPhone.js'

const emptyDraft = {
  name: '',
  phone: '',
  inviteCode: '',
  vehicleNumber: '',
  startDate: '',
  endDate: '',
}

export default function DriverConnectionPage({ ownerKey = 'guest', session, onBack, showToast }) {
  const [drivers, setDrivers] = useState(() => loadDrivers(ownerKey))
  const [cars, setCars] = useState(() => loadCars(ownerKey))
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(emptyDraft)

  const counts = countByStatus(drivers)
  const cloud = isCloudSession(session)
  const assignableCars = cars.filter((car) => car.type !== 'main')

  function persist(next) {
    setDrivers(next)
    saveDrivers(ownerKey, next)
  }

  function openAdd() {
    setEditingId(null)
    setDraft({ ...emptyDraft, inviteCode: generateInviteCode(drivers) })
    setModalOpen(true)
  }

  function openEdit(driver) {
    setEditingId(driver.id)
    setDraft({
      name: driver.name || '',
      phone: driver.phone || '',
      inviteCode: driver.inviteCode || '',
      vehicleNumber: driver.vehicleNumber || '',
      startDate: driver.startDate || '',
      endDate: driver.endDate || '',
    })
    setModalOpen(true)
  }

  function save() {
    const result = upsertDriver(drivers, draft, editingId, cars)
    if (result.error) {
      showToast?.(result.error)
      return
    }

    const newId = editingId || result.items[result.items.length - 1]?.id
    if (!cloud) {
      persist(result.items)
      setModalOpen(false)
      showToast?.(editingId ? '초대를 수정했습니다.' : '초대를 저장했습니다.')
      return
    }

    saveDriverInviteToCloud(result.items, newId, cars).then((cloudResult) => {
      if (cloudResult.error) {
        showToast?.(cloudResult.error)
        return
      }
      persist(cloudResult.items)
      setModalOpen(false)
      showToast?.(editingId ? '기사 할당 정보를 수정했습니다.' : '기사 초대를 저장했습니다.')
    }).catch((error) => {
      showToast?.(error?.message || '초대 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    })
  }

  function changeStatus(id, status) {
    const driver = drivers.find((item) => item.id === id)
    // 감사 보완 3차: 서버에 반영해야 할 상태변경(supabaseId가 있는 기사 링크)은
    // 로컬을 먼저 바꾸기 전에 클라우드 쓰기 준비 상태부터 확인한다.
    const blocked = cloud ? blockedReasonForCloudWrite(driver?.supabaseId) : null
    if (blocked) {
      showToast?.(blocked)
      return
    }
    persist(setDriverStatus(drivers, id, status))
    if (cloud && driver?.supabaseId) {
      updateDriverLinkStatusOnSupabase(driver.supabaseId, status === 'linked' ? 'linked' : 'pending').catch((error) => {
        console.error(error)
      })
    }
    showToast?.(status === 'linked' ? '연동 중으로 바꿨습니다.' : '대기 상태로 바꿨습니다.')
  }

  function remove(id) {
    const driver = drivers.find((item) => item.id === id)
    const blocked = cloud ? blockedReasonForCloudWrite(driver?.supabaseId) : null
    if (blocked) {
      showToast?.(blocked)
      return
    }
    persist(removeDriver(drivers, id))
    if (cloud && driver?.supabaseId) {
      deleteDriverLinkOnSupabase(driver.supabaseId).catch((error) => console.error(error))
    }
    showToast?.('초대를 삭제했습니다.')
  }

  return (
    <div className="page driver-connection-page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">기사 연동 관리</div>
        <div style={{ width: 40 }}></div>
      </div>

      <section className="personal-intro">
        <span className="personal-intro-kicker">DRIVER CONNECTION</span>
        <strong>기사 초대부터 차량 할당까지</strong>
        <p>{cloud ? '같은 차량에 기간이 겹치는 기사는 할당할 수 없습니다. 로그인한 계정은 클라우드에도 저장됩니다.' : '연습 앱에서는 초대 목록만 이 기기에 저장합니다. 같은 차량·겹치는 기간은 할당할 수 없습니다.'}</p>
        <div className="driver-management-counts">
          <span>연동 중 <b>{counts.linked}</b></span>
          <span>초대 대기 <b>{counts.pending}</b></span>
        </div>
      </section>

      {drivers.length === 0 && <div className="empty-state">초대된 기사가 없습니다.</div>}
      {drivers.map((driver) => (
        <div key={driver.id} className="management-list-card">
          <div className="management-card-copy">
            <div className="client-card-title">
              <strong>{driver.name}</strong>
              <span className={`management-badge ${driver.status === 'linked' ? 'main' : ''}`}>
                {driver.status === 'linked' ? '연동 중' : '초대 대기'}
              </span>
            </div>
            <div className="car-sub-text">{driver.phone} · 코드 {driver.inviteCode}</div>
            <div className="car-sub-text">
              {driver.vehicleNumber || '차량 미지정'}
              {driver.startDate ? ` · ${driver.startDate}` : ''}
              {driver.endDate ? ` ~ ${driver.endDate}` : ' · 종료일 없음'}
            </div>
          </div>
          <div className="receivable-card-actions">
            <button type="button" className="action-icon-btn" onClick={() => openEdit(driver)}>수정</button>
            {driver.status !== 'linked' ? (
              <button type="button" className="action-icon-btn" onClick={() => changeStatus(driver.id, 'linked')}>연동 완료</button>
            ) : (
              <button type="button" className="action-icon-btn" onClick={() => changeStatus(driver.id, 'pending')}>대기</button>
            )}
            <button type="button" className="action-icon-btn del" onClick={() => remove(driver.id)}>삭제</button>
          </div>
        </div>
      ))}

      <button type="button" className="management-add-fab" onClick={openAdd}>+ 초대</button>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content client-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{editingId ? '초대 수정' : '기사 초대'}</div>
            <div className="form-group">
              <label htmlFor="drvName">기사 이름</label>
              <input id="drvName" className="input-box" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="drvPhone">기사 전화번호</label>
              <input id="drvPhone" className="input-box" type="tel" placeholder="010-0000-0000" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: formatPhoneNumber(e.target.value) })} />
            </div>
            <div className="form-group">
              <label htmlFor="drvCode">초대 코드</label>
              <div className="driver-code-row">
                <input id="drvCode" className="input-box" inputMode="numeric" maxLength={6} value={draft.inviteCode} onChange={(e) => setDraft({ ...draft, inviteCode: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
                <button type="button" className="theme-toggle-btn" onClick={() => setDraft({ ...draft, inviteCode: generateInviteCode(drivers) })}>코드 생성</button>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="drvCar">할당 차량</label>
              <input id="drvCar" className="input-box" list="drvCarOptions" placeholder="차량번호" value={draft.vehicleNumber} onChange={(e) => setDraft({ ...draft, vehicleNumber: e.target.value })} />
              <datalist id="drvCarOptions">
                {assignableCars.map((car) => <option key={car.id} value={car.number} />)}
              </datalist>
            </div>
            <div className="personal-inline-fields">
              <div className="form-group">
                <label htmlFor="drvStart">할당 시작일</label>
                <input id="drvStart" type="date" className="input-box" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
              </div>
              <div className="form-group">
                <label htmlFor="drvEnd">할당 종료일</label>
                <input id="drvEnd" type="date" className="input-box" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
              </div>
            </div>
            <p className="car-type-hint">같은 차량에 기간이 겹치면 저장되지 않습니다. 종료일이 없으면 계속 할당됩니다. 메인 차량은 할당할 수 없습니다.</p>
            <div className="modal-btns">
              <button type="button" className="modal-btn cancel" onClick={() => setModalOpen(false)}>취소</button>
              <button type="button" className="modal-btn confirm" onClick={save}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
