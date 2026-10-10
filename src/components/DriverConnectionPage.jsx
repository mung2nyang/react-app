// @ts-check
// 기사 연동 화면. 저장·상태 변경·삭제는 lib/directMutationActions.js, 초대 폼은 DriverFormModal.jsx.
/** @typedef {import('../lib/outboxTypes.js').AppSession} AppSession */
/** @typedef {import('../lib/outboxTypes.js').DriverRecord} DriverRecord */
import { useState } from 'react'
import { getCloudUserId, isCloudSession } from '../lib/cloudSession.js'
import {
  requestDriverDeletion,
  requestDriverInviteSave,
  requestDriverStatusChange,
} from '../lib/directMutationActions.js'
import { countByStatus, formatInviteCode, generateInviteCode, saveDrivers, upsertDriver } from '../lib/drivers.js'
import { requestDriverUnlinkAction } from '../lib/driverUnlink.js'
import { useOwnerCars, useOwnerDrivers, useOwnerProfile } from '../store/ownerDataHooks.js'
import DriverUnlinkControls from './drivers/DriverUnlinkControls.jsx'
import DriverFormModal from './DriverFormModal.jsx'
import PageHeader from './PageHeader.jsx'
import './drivers/driver-connection.css'

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
    const result = upsertDriver(drivers, draft, editingId, cars)
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

  /** @param {string} id @param {import('../lib/driverUnlink.js').UnlinkAction} action */
  async function unlink(id, action) {
    const result = await requestDriverUnlinkAction({ ownerKey, drivers, driverId: id, action })
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
            <p>연동 상태와 차량 계약기간을 관리합니다.</p>
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
          <div className="car-sub-text">
            {[driver.phone, driver.status !== 'linked' && `초대 코드 ${formatInviteCode(driver.inviteCode)}`].filter(Boolean).join(' · ')}
          </div>

          <div className="driver-assignment-grid">
            <div>
              <span>배정 차량</span>
              <strong>{driver.vehicleNumber || '차량 미지정'}</strong>
            </div>
            <div>
              <span>계약기간</span>
              <strong>{driver.startDate || '-'}{driver.endDate ? ` ~ ${driver.endDate}` : ' ~ 종료일 없음'}</strong>
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
                <DriverUnlinkControls driver={driver} meId={cloudUserId} counterpartLabel="기사" onAction={(action) => { void unlink(driver.id, action) }} />
              </>
            ) : (
              <>
                <button type="button" className="driver-card-action-btn" onClick={() => openEdit(driver)}>초대 수정</button>
                {!cloud && <button type="button" className="driver-card-action-btn primary" onClick={() => changeStatus(driver.id, 'linked')}>연동 완료</button>}
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
