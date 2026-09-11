// @ts-check
// 콜상세 거래처 입력란 옆 "+ 추가" — ClientFormModal·requestClientSave 재사용.
import { useState } from 'react'
import ClientFormModal from '../clients/ClientFormModal.jsx'
import { getCloudUserId } from '../../lib/cloudSession.js'
import { requestClientSave } from '../../lib/clientMutations.js'
import './call-client-quick-add.css'

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
 * @param {string} props.ownerKey
 * @param {Array<ClientLike>} props.clients
 * @param {string} [props.logId]
 * @param {(companyName: string) => void} props.onClientAdded
 * @param {(message: string) => void} [props.showToast]
 */
export default function CallClientQuickAdd({ ownerKey, clients, logId = 'main', onClientAdded, showToast }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const scopeKey = !logId || logId === 'main' ? '' : logId

  function openAdd() {
    setDraft(scopeKey ? { ...emptyDraft, scopedToVehicleNumber: scopeKey } : { ...emptyDraft })
    setModalOpen(true)
  }

  async function save() {
    const payload = scopeKey
      ? { ...draft, scopedToVehicleNumber: scopeKey, fixedRouteLinked: false }
      : { ...draft }
    const result = await requestClientSave({
      ownerKey,
      userId: getCloudUserId(),
      clients,
      draft: payload,
      editingId: null,
    })
    if (result.toast) showToast?.(result.toast)
    if (result.failed) return
    setModalOpen(false)
    const name = String(result.saved?.companyName || draft.companyName || '').trim()
    if (name) onClientAdded(name)
  }

  return (
    <>
      <button type="button" className="call-client-add-btn" onClick={openAdd}>+ 추가</button>
      {modalOpen && (
        <ClientFormModal
          draft={draft}
          setDraft={setDraft}
          editingId={null}
          onCancel={() => setModalOpen(false)}
          onSave={save}
          hideFixedRoute={!!scopeKey}
        />
      )}
    </>
  )
}
