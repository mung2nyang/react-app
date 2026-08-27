// Step 0-4 감사 보완 4차: 저장/상태변경/삭제 오케스트레이션을 lib/directMutationActions.js
// 로 뺐다(사용자 지시 6번) — 이제 durable mutation outbox를 거쳐 로컬+서버가 원자적으로
// 반영되고, 실패해도 outbox에 남아 자동 재시도된다. 폼 모달은 DriverFormModal.jsx로
// 분리했다(200줄 제한).
import { useState } from 'react'
import { loadCars } from '../lib/cars.js'
import { getCloudUserId, isCloudSession } from '../lib/cloudSession.js'
import {
  requestDriverDeletion,
  requestDriverInviteSave,
  requestDriverStatusChange,
} from '../lib/directMutationActions.js'
import { countByStatus, generateInviteCode, loadDrivers, saveDrivers, upsertDriver } from '../lib/drivers.js'
import DriverFormModal from './DriverFormModal.jsx'

const emptyDraft = { name: '', phone: '', inviteCode: '', vehicleNumber: '', startDate: '', endDate: '' }

export default function DriverConnectionPage({ ownerKey = 'guest', session, onBack, showToast }) {
  const [drivers, setDrivers] = useState(() => loadDrivers(ownerKey))
  const [cars] = useState(() => loadCars(ownerKey))
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(emptyDraft)

  const counts = countByStatus(drivers)
  const cloud = isCloudSession(session)
  const assignableCars = cars.filter((car) => car.type !== 'main')

  function openAdd() {
    setEditingId(null)
    setDraft({ ...emptyDraft, inviteCode: generateInviteCode(drivers) })
    setModalOpen(true)
  }

  function openEdit(driver) {
    setEditingId(driver.id)
    setDraft({
      name: driver.name || '', phone: driver.phone || '', inviteCode: driver.inviteCode || '',
      vehicleNumber: driver.vehicleNumber || '', startDate: driver.startDate || '', endDate: driver.endDate || '',
    })
    setModalOpen(true)
  }

  async function save() {
    const result = upsertDriver(drivers, draft, editingId, cars)
    if (result.error) {
      showToast?.(result.error)
      return
    }
    if (!cloud) {
      setDrivers(result.items)
      saveDrivers(ownerKey, result.items)
      setModalOpen(false)
      showToast?.(editingId ? '초대를 수정했습니다.' : '초대를 저장했습니다.')
      return
    }
    // editingId를 그대로 넘긴다(newId로 바꿔치기하지 않는다) — requestDriverInviteSave
    // 내부의 idx 조회가 "id로 못 찾으면 마지막 항목"으로 이미 신규 생성 케이스를
    // 처리하고, 토스트 문구(수정 vs 저장)도 이 원래 editingId(신규면 null)로 갈린다.
    const saveResult = await requestDriverInviteSave({ ownerKey, userId: getCloudUserId(), items: result.items, editingId, cars })
    if (saveResult.blocked) {
      showToast?.(saveResult.blocked)
      return
    }
    setDrivers(saveResult.items)
    setModalOpen(false)
    if (saveResult.toast) showToast?.(saveResult.toast)
  }

  async function changeStatus(id, status) {
    const result = await requestDriverStatusChange({ ownerKey, userId: getCloudUserId(), drivers, driverId: id, status, cloud })
    setDrivers(result.drivers)
    if (result.toast) showToast?.(result.toast)
  }

  async function remove(id) {
    const result = await requestDriverDeletion({ ownerKey, userId: getCloudUserId(), drivers, driverId: id, cloud })
    setDrivers(result.drivers)
    if (result.toast) showToast?.(result.toast)
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
        <DriverFormModal
          draft={draft}
          setDraft={setDraft}
          editingId={editingId}
          drivers={drivers}
          assignableCars={assignableCars}
          onCancel={() => setModalOpen(false)}
          onSave={save}
        />
      )}
    </div>
  )
}
