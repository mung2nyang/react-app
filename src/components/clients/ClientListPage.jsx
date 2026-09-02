// @ts-check
import { useState } from 'react'
import ConfirmModal from '../ConfirmModal.jsx'
import ClientFormModal from './ClientFormModal.jsx'
import ClientListItem from './ClientListItem.jsx'
import { useClientReorder } from './useClientReorder.js'
import { requestClientSave } from '../../lib/clientMutations.js'
import { requestClientDeletion } from '../../lib/directMutationActions.js'
import { getCloudUserId } from '../../lib/cloudSession.js'
import { useOwnerClients } from '../../store/ownerDataHooks.js'

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
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 */
export default function ClientListPage({ ownerKey = 'guest', onBack, showToast }) {
  const clients = useOwnerClients(ownerKey)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(/** @type {string|null} */ (null))
  const [draft, setDraft] = useState(emptyDraft)
  const [pendingDelete, setPendingDelete] = useState(/** @type {import('../../domain/clientTypes.js').ClientLike|null} */ (null))
  const reorder = useClientReorder(ownerKey, clients, showToast)

  function openAdd() {
    setEditingId(null)
    setDraft({ ...emptyDraft })
    setModalOpen(true)
  }

  function openEdit(/** @type {ClientLike} */ client) {
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
      commEnabled: !!client.commEnabled,
      commType: client.commType === 'direct' ? 'direct' : 'percent',
      commValue: String(client.commValue || ''),
      fixedRouteLinked: !!client.fixedRouteLinked,
      fixedUnitPrice: String(client.fixedUnitPrice || ''),
      palletOn: !!client.palletOn,
      palletPrice: String(client.palletPrice || ''),
    })
    setModalOpen(true)
  }

  async function save() {
    const result = await requestClientSave({ ownerKey, userId: getCloudUserId(), clients, draft, editingId })
    if (result.toast) showToast?.(result.toast)
    if (result.failed) return
    setModalOpen(false)
  }

  async function confirmRemove() {
    const client = pendingDelete
    if (!client?.id) return
    const result = await requestClientDeletion({ ownerKey, userId: getCloudUserId(), clients, clientId: client.id })
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
      <div className="client-list" id="clientListContainer">
        {clients.length === 0 && <div className="empty-state">등록된 거래처가 없습니다.</div>}
        {clients.map((client) => (
          <ClientListItem
            key={client.id}
            client={client}
            dragging={reorder.dragId === client.id}
            onDragStart={() => reorder.onDragStart(client.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => reorder.onDrop(client.id)}
            onDragEnd={reorder.onDragEnd}
            onEdit={() => openEdit(client)}
            onDelete={() => setPendingDelete(client)}
          />
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
