// @ts-check
// 한 차량 거래처(scopedToVehicleNumber) 목록의 추가·수정·삭제 — 연동 기사 앱 거래처·차주의 기사 거래처가 같이 쓴다.
import { useState } from 'react'
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

/** @param {ClientLike} item @param {string} scopeKey @returns {ClientDraft} */
function clientToDraft(item, scopeKey) {
  return {
    companyName: item.companyName || '', managerName: item.managerName || '',
    phone: item.phone || '', bizNumber: item.bizNumber || '',
    taxRepresentative: item.taxRepresentative || item.managerName || '',
    taxEmail: item.taxEmail || '', taxAddress: item.taxAddress || '',
    taxBizType: item.taxBizType || '', taxBizItem: item.taxBizItem || '',
    paymentTerm: item.paymentTerm || 'next_month_end', paymentTermValue: item.paymentTermValue || '',
    isPinned: !!item.isPinned, scopedToVehicleNumber: item.scopedToVehicleNumber || scopeKey,
    commEnabled: !!item.commEnabled, commType: item.commType === 'direct' ? 'direct' : 'percent',
    commValue: String(item.commValue || ''), fixedRouteLinked: !!item.fixedRouteLinked,
    fixedUnitPrice: String(item.fixedUnitPrice || ''), palletOn: !!item.palletOn, palletPrice: String(item.palletPrice || ''),
  }
}

/**
 * @param {{ ownerKey: string, scopeKey: string, showToast?: (message: string) => void }} params
 */
export function useScopedClients({ ownerKey, scopeKey, showToast }) {
  const clients = useOwnerClients(ownerKey)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(/** @type {string|null} */ (null))
  const [draft, setDraft] = useState(emptyDraft)
  const [pendingDelete, setPendingDelete] = useState(/** @type {ClientLike|null} */ (null))

  const scopedClients = clients.filter((c) => scopeKey && c.scopedToVehicleNumber === scopeKey)

  function openAdd() {
    setEditingId(null)
    setDraft({ ...emptyDraft, scopedToVehicleNumber: scopeKey })
    setModalOpen(true)
  }

  /** @param {ClientLike} item */
  function openEdit(item) {
    setEditingId(item.id)
    setDraft(clientToDraft(item, scopeKey))
    setModalOpen(true)
  }

  async function save() {
    const payload = { ...draft, scopedToVehicleNumber: scopeKey }
    const result = await requestClientSave({ ownerKey, userId: getCloudUserId(), clients, draft: payload, editingId })
    if (result.toast) showToast?.(result.toast)
    if (result.failed) return
    setModalOpen(false)
  }

  async function confirmRemove() {
    const clientToDelete = pendingDelete
    if (!clientToDelete?.id) return
    const result = await requestClientDeletion({ ownerKey, userId: getCloudUserId(), clients, clientId: clientToDelete.id })
    if (result.toast) showToast?.(result.toast)
    if (result.failed || result.closeModal === false) return
    setPendingDelete(null)
  }

  return {
    scopedClients, modalOpen, editingId, draft, setDraft, pendingDelete, setPendingDelete,
    openAdd, openEdit, save, confirmRemove, closeModal: () => setModalOpen(false),
  }
}
