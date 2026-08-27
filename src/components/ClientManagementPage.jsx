// Step 0-4 감사 보완 4차: 삭제 오케스트레이션을 lib/directMutationActions.js로 뺐고
// (사용자 지시 6번), 폼 모달은 ClientFormModal.jsx로 분리했다(200줄 제한).
import { useState } from 'react'
import ConfirmModal from './ConfirmModal.jsx'
import ClientFormModal from './ClientFormModal.jsx'
import { getPaymentTermLabel, loadClients, reorderClients, saveClients, upsertClient } from '../lib/clients.js'
import { requestClientDeletion } from '../lib/directMutationActions.js'
import { getCloudUserId } from '../lib/cloudSession.js'

const emptyDraft = {
  companyName: '', managerName: '', phone: '', bizNumber: '', taxRepresentative: '',
  taxEmail: '', taxAddress: '', taxBizType: '', taxBizItem: '',
  paymentTerm: 'next_month_end', paymentTermValue: '', isPinned: false,
}

export default function ClientManagementPage({ ownerKey = 'guest', onBack, showToast }) {
  const [clients, setClients] = useState(() => loadClients(ownerKey))
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [dragId, setDragId] = useState(null)

  function persist(next) {
    setClients(next)
    saveClients(ownerKey, next)
  }

  function openAdd() {
    setEditingId(null)
    setDraft({ ...emptyDraft })
    setModalOpen(true)
  }

  function openEdit(client) {
    setEditingId(client.id)
    setDraft({
      companyName: client.companyName || '',
      managerName: client.managerName || '',
      phone: client.phone || '',
      bizNumber: client.bizNumber || '',
      taxRepresentative: client.taxRepresentative || client.managerName || '',
      taxEmail: client.taxEmail || '',
      taxAddress: client.taxAddress || '',
      taxBizType: client.taxBizType || '',
      taxBizItem: client.taxBizItem || '',
      paymentTerm: client.paymentTerm || 'next_month_end',
      paymentTermValue: client.paymentTermValue || '',
      isPinned: !!client.isPinned,
    })
    setModalOpen(true)
  }

  function save() {
    const result = upsertClient(clients, draft, editingId)
    if (result.error) {
      showToast?.(result.error)
      return
    }
    persist(result.clients)
    setModalOpen(false)
    showToast?.(editingId ? '거래처를 수정했습니다.' : '거래처를 등록했습니다.')
  }

  function remove(id) {
    const client = clients.find((item) => item.id === id)
    if (!client) return
    setPendingDelete(client)
  }

  async function confirmRemove() {
    const client = pendingDelete
    if (!client) return
    setPendingDelete(null)
    const result = await requestClientDeletion({ ownerKey, userId: getCloudUserId(), clients, clientId: client.id })
    setClients(result.clients)
    if (result.toast) showToast?.(result.toast)
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

      <div className="client-list" id="clientListContainer">
        {clients.length === 0 && <div className="empty-state">등록된 거래처가 없습니다.</div>}
        {clients.map((client) => (
          <div
            key={client.id}
            className={`management-list-card client-list-card${dragId === client.id ? ' client-dragging' : ''}`}
            draggable
            onDragStart={() => setDragId(client.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (!dragId) return
              persist(reorderClients(clients, dragId, client.id))
              setDragId(null)
            }}
            onDragEnd={() => setDragId(null)}
          >
            <div className="management-card-copy">
              <div className="client-card-title">
                <strong>{client.companyName}</strong>
                {client.isPinned && <span className="management-badge pinned">★ 즐겨찾기</span>}
                {client.managerName && <span>{client.managerName} 담당</span>}
              </div>
              <div className="car-sub-text">
                <span>사업자 {client.bizNumber || '-'}</span>
                <span>연락처 {client.phone || '-'}</span>
              </div>
              <div className="car-sub-text">
                결제주기: {getPaymentTermLabel(client.paymentTerm, client.paymentTermValue)}
              </div>
            </div>
            <div className="car-action-btns">
              <button type="button" className="action-icon-btn" onClick={() => openEdit(client)}>수정</button>
              <button type="button" className="action-icon-btn del" onClick={() => remove(client.id)}>삭제</button>
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="management-add-fab" onClick={openAdd}>+ 추가</button>

      {modalOpen && (
        <ClientFormModal draft={draft} setDraft={setDraft} editingId={editingId} onCancel={() => setModalOpen(false)} onSave={save} />
      )}

      {pendingDelete && (
        <ConfirmModal message="해당 업체를 삭제하시겠습니까?" onCancel={() => setPendingDelete(null)} onConfirm={confirmRemove} />
      )}
    </div>
  )
}
