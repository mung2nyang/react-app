// @ts-check
// Step 0-4 감사 보완 4차: 저장/상태변경/삭제 오케스트레이션을 lib/directMutationActions.js
// 로 뺐다(사용자 지시 6번) — 이제 durable mutation outbox를 거쳐 로컬+서버가 원자적으로
// 반영되고, 실패해도 outbox에 남아 자동 재시도된다. 폼 모달은 DriverFormModal.jsx로
// 분리했다(200줄 제한).
/** @typedef {import('../lib/outboxTypes.js').AppSession} AppSession */
/** @typedef {import('../lib/outboxTypes.js').DriverRecord} DriverRecord */
import { useState } from 'react'
import { getCloudUserId, isCloudSession } from '../lib/cloudSession.js'
import {
  requestDriverDeletion,
  requestDriverInviteSave,
  requestDriverStatusChange,
} from '../lib/directMutationActions.js'
import { countByStatus, generateInviteCode, saveDrivers, upsertDriver } from '../lib/drivers.js'
import { useOwnerCars, useOwnerDrivers, useOwnerProfile } from '../store/ownerDataHooks.js'
import DriverFormModal from './DriverFormModal.jsx'
import PageHeader from './PageHeader.jsx'
import './drivers/linked-driver.css'

const emptyDraft = { name: '', phone: '', inviteCode: '', vehicleNumber: '', startDate: '', endDate: '' }

/**
 * @param {{ ownerKey?: string, session: AppSession|null, onBack: () => void, showToast?: (message: string) => void, navigate?: (to: import('react-router-dom').To | number, options?: import('react-router-dom').NavigateOptions) => void }} props
 */
export default function DriverConnectionPage({ ownerKey = 'guest', session, onBack, showToast, navigate }) {
  const drivers = useOwnerDrivers(ownerKey)
  const cars = useOwnerCars(ownerKey)
  const profile = useOwnerProfile(ownerKey)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(/** @type {string|null} */ (null))
  const [draft, setDraft] = useState(emptyDraft)

  const counts = countByStatus(drivers)
  const cloud = isCloudSession(session)
  const assignableCars = cars.filter((car) => car.type !== 'main')
  const cloudUserId = getCloudUserId() ?? ''

  function openAdd() {
    setEditingId(null)
    setDraft({ ...emptyDraft, inviteCode: generateInviteCode(drivers) })
    setModalOpen(true)
  }

  /** @param {DriverRecord} driver */
  function openEdit(driver) {
    setEditingId(driver.id)
    setDraft({
      name: driver.name || '', phone: driver.phone || '', inviteCode: driver.inviteCode || '',
      vehicleNumber: driver.vehicleNumber || '', startDate: driver.startDate || '', endDate: driver.endDate || '',
    })
    setModalOpen(true)
  }

  async function save() {
    // domain/drivers.js는 이번 라운드(Step 0-4 보완) 범위 밖이라 아직 @ts-check 대상이
    // 아니다 — `editingId = null` 기본값만으로 타입이 추론돼 upsertDriver의 3번째
    // 매개변수가 실제로는 string도 받는데 `null|undefined`로만 좁게 추론된다. Step 11
    // (전체 JS→TS 전환)에서 domain/drivers.js에 JSDoc을 달면 이 단언은 필요 없어진다.
    const result = upsertDriver(drivers, draft, /** @type {null|undefined} */ (editingId), cars)
    if (result.error) {
      showToast?.(result.error)
      return
    }
    if (!cloud) {
      saveDrivers(ownerKey, result.items)
      setModalOpen(false)
      showToast?.(editingId ? '초대를 수정했습니다.' : '초대를 저장했습니다.')
      return
    }
    // editingId를 그대로 넘긴다(newId로 바꿔치기하지 않는다) — requestDriverInviteSave
    // 내부의 idx 조회가 "id로 못 찾으면 마지막 항목"으로 이미 신규 생성 케이스를
    // 처리하고, 토스트 문구(수정 vs 저장)도 이 원래 editingId(신규면 null)로 갈린다.
    const saveResult = await requestDriverInviteSave({
      ownerKey,
      userId: cloudUserId,
      items: result.items,
      editingId,
      cars: /** @type {import('../lib/outboxTypes.js').CarRecord[]} */ (cars),
      previousItems: drivers,
    })
    if (saveResult.blocked) {
      showToast?.(saveResult.blocked)
      return
    }
    setModalOpen(false)
    if (saveResult.toast) showToast?.(saveResult.toast)
  }

  /** @param {string} id @param {'pending'|'linked'} status */
  async function changeStatus(id, status) {
    const result = await requestDriverStatusChange({ ownerKey, userId: cloudUserId, drivers, driverId: id, status, cloud })
    if (result.toast) showToast?.(result.toast)
  }

  /** @param {string} id */
  async function remove(id) {
    const result = await requestDriverDeletion({ ownerKey, userId: cloudUserId, drivers, driverId: id, cloud })
    if (result.toast) showToast?.(result.toast)
  }

  return (
    <div className="page driver-connection-page">
      <PageHeader title="기사 연동 관리" onBack={onBack} />

      <section className="driver-summary-card">
        <div className="driver-section-heading">
          <div>
            <h3>기사 연결 현황</h3>
            <p>연동 상태와 차량 할당 기간을 관리합니다.</p>
          </div>
        </div>
        <div className="driver-summary-counts">
          <div><span>연동 중</span><strong>{counts.linked}</strong></div>
          <div><span>초대 대기</span><strong>{counts.pending}</strong></div>
        </div>
      </section>

      {drivers.length === 0 && <div className="empty-state">초대된 기사가 없습니다.</div>}
      {drivers.map((driver) => (
        <div key={driver.id} className="driver-connection-card">
          <div className="driver-connection-card-head">
            <strong>{driver.name}</strong>
            <span className={`management-badge ${driver.status === 'linked' ? 'main' : ''}`}>
              {driver.status === 'linked' ? '연동 중' : '초대 대기'}
            </span>
          </div>
          <div className="car-sub-text">초대코드 {driver.inviteCode}</div>
          <div className="car-sub-text">{driver.phone}</div>

          <div className="driver-assignment-grid">
            <div>
              <span>할당 차량</span>
              <strong>{driver.vehicleNumber || '차량 미지정'}</strong>
            </div>
            <div>
              <span>할당 기간</span>
              <strong>{driver.startDate || '-'}{driver.endDate ? ` ~ ${driver.endDate}` : ' ~ 계속'}</strong>
            </div>
          </div>

          <div className="driver-card-actions">
            {driver.status === 'linked' ? (
              <>
                <button
                  type="button"
                  className="driver-card-action-btn primary"
                  onClick={() => navigate?.(`/app/drivers/${encodeURIComponent(driver.id)}`)}
                >
                  기사 관리
                </button>
                <button type="button" className="driver-card-action-btn" onClick={() => openEdit(driver)}>수정</button>
                <button type="button" className="driver-card-action-btn danger" onClick={() => remove(driver.id)}>연동 해제</button>
              </>
            ) : (
              <>
                <button type="button" className="driver-card-action-btn" onClick={() => openEdit(driver)}>초대 수정</button>
                <button type="button" className="driver-card-action-btn primary" onClick={() => changeStatus(driver.id, 'linked')}>연동 완료</button>
                <button type="button" className="driver-card-action-btn danger" onClick={() => remove(driver.id)}>초대 취소</button>
              </>
            )}
          </div>
        </div>
      ))}

      {cloud && (
        <button type="button" className="management-add-fab" onClick={openAdd}>+ 초대</button>
      )}

      {modalOpen && (
        <DriverFormModal
          draft={draft}
          setDraft={setDraft}
          editingId={editingId}
          drivers={drivers}
          assignableCars={assignableCars}
          ownerDisplayName={profile.bizName || profile.name || '운송사'}
          showToast={showToast}
          onCancel={() => setModalOpen(false)}
          onSave={save}
        />
      )}
    </div>
  )
}
