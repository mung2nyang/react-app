// @ts-check
import { useState } from 'react'
import ConfirmModal from '../ConfirmModal.jsx'
import ClientFormModal from './ClientFormModal.jsx'
import { requestClientSave } from '../../lib/clientMutations.js'
import { requestClientDeletion } from '../../lib/directMutationActions.js'
import { getCloudUserId } from '../../lib/cloudSession.js'
import { useOwnerCars, useOwnerClients } from '../../store/ownerDataHooks.js'
import '../drivers/linked-driver.css'

/** @typedef {import('../../domain/clientTypes.js').ClientDraft} ClientDraft */
/** @typedef {import('../../domain/clientTypes.js').ClientLike} ClientLike */

/** @type {ClientDraft} */
const emptyDraft = {
  companyName: '', managerName: '', phone: '', bizNumber: '', taxRepresentative: '',
  taxEmail: '', taxAddress: '', taxBizType: '', taxBizItem: '',
  paymentTerm: 'next_month_end', paymentTermValue: '', isPinned: false,
  commEnabled: false, commType: 'percent', commValue: '',
  fixedRouteLinked: false, fixedUnitPrice: '', palletOn: false, palletPrice: '',
}

/**
 * 소속기사용 거래처 관리 화면 (기사↔차주 상호 편집).
 * 차주와 하나의 레코드를 공유하며 등록·수정·삭제가 가능합니다.
 *
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 */
export default function OwnerScopedClientsView({ ownerKey = 'guest', onBack, showToast }) {
  const cars = useOwnerCars(ownerKey)
  const clients = useOwnerClients(ownerKey)

  const scopeKey = cars[0]?.number || ''
  const scopedClients = clients.filter((c) => scopeKey && c.scopedToVehicleNumber === scopeKey)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(/** @type {string|null} */ (null))
  const [draft, setDraft] = useState(emptyDraft)
  const [pendingDelete, setPendingDelete] = useState(/** @type {ClientLike|null} */ (null))

  function openAdd() {
    setEditingId(null)
    setDraft({ ...emptyDraft, scopedToVehicleNumber: scopeKey })
    setModalOpen(true)
  }

  /** @param {ClientLike} item */
  function openEdit(item) {
    setEditingId(item.id)
    setDraft({
      companyName: item.companyName || '', managerName: item.managerName || '',
      phone: item.phone || '', bizNumber: item.bizNumber || '',
      taxRepresentative: item.taxRepresentative || item.managerName || '',
      taxEmail: item.taxEmail || '', taxAddress: item.taxAddress || '',
      taxBizType: item.taxBizType || '', taxBizItem: item.taxBizItem || '',
      paymentTerm: item.paymentTerm || 'next_month_end', paymentTermValue: item.paymentTermValue || '',
      isPinned: !!item.isPinned, scopedToVehicleNumber: item.scopedToVehicleNumber || scopeKey,
      commEnabled: !!item.commEnabled, commType: item.commType === 'direct' ? 'direct' : 'percent',
      commValue: String(item.commValue || ''), fixedRouteLinked: false,
      fixedUnitPrice: '', palletOn: !!item.palletOn, palletPrice: String(item.palletPrice || ''),
    })
    setModalOpen(true)
  }

  async function save() {
    const payload = { ...draft, scopedToVehicleNumber: scopeKey, fixedRouteLinked: false }
    const result = await requestClientSave({
      ownerKey,
      userId: getCloudUserId(),
      clients,
      draft: payload,
      editingId,
    })
    if (result.toast) showToast?.(result.toast)
    if (result.failed) return
    setModalOpen(false)
  }

  async function confirmRemove() {
    const clientToDelete = pendingDelete
    if (!clientToDelete?.id) return
    const result = await requestClientDeletion({
      ownerKey,
      userId: getCloudUserId(),
      clients,
      clientId: clientToDelete.id,
    })
    if (result.toast) showToast?.(result.toast)
    if (result.failed || result.closeModal === false) return
    setPendingDelete(null)
  }

  return (
    <div className="page client-management-page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">거래처</div>
        <div style={{ width: 40 }}></div>
      </div>

      <div className="client-list" id="ownerScopedClientsListContainer">
        <p className="linked-driver-readonly-notice" style={{ marginBottom: 10 }}>
          <span>차주와 공유하는 거래처 목록입니다. 등록·수정·삭제가 차주 화면에도 함께 반영됩니다.</span>
        </p>
        {!scopedClients.length ? (
          <div className="empty-state">등록된 거래처가 없습니다.</div>
        ) : (
          scopedClients.map((client) => (
            <div key={client.id} className="management-list-card client-list-card">
              <div className="management-card-inner">
                <div className="client-card-copy">
                  <div className="client-card-title">
                    <strong>{client.companyName}</strong>
                    {client.managerName && <span>{client.managerName} 담당</span>}
                  </div>
                  <div className="car-sub-text">
                    <span>사업자 {client.bizNumber || '-'}</span>
                    <span>연락처 {client.phone || '-'}</span>
                  </div>
                </div>
                <div className="car-action-btns">
                  <button type="button" className="action-icon-btn" onClick={() => openEdit(client)} title="수정">수정</button>
                  <button type="button" className="action-icon-btn del" onClick={() => setPendingDelete(client)} title="삭제">삭제</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <button type="button" className="management-add-fab" onClick={openAdd}>+ 추가</button>
      {modalOpen && (
        <ClientFormModal
          draft={draft}
          setDraft={setDraft}
          editingId={editingId}
          onCancel={() => setModalOpen(false)}
          onSave={save}
          hideFixedRoute={true}
        />
      )}
      {pendingDelete && (
        <ConfirmModal
          message="해당 업체를 삭제하시겠습니까?"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmRemove}
        />
      )}
    </div>
  )
}
