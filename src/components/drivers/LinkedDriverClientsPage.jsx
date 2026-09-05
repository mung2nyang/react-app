// @ts-check
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ConfirmModal from '../ConfirmModal.jsx'
import ClientFormModal from '../clients/ClientFormModal.jsx'
import { getEffectiveDriverSettlementMode } from '../../domain/cars.js'
import { requestClientSave } from '../../lib/clientMutations.js'
import { requestClientDeletion } from '../../lib/directMutationActions.js'
import { getCloudUserId } from '../../lib/cloudSession.js'
import {
  useOwnerCars,
  useOwnerClients,
  useOwnerDrivers,
  useOwnerSettings,
} from '../../store/ownerDataHooks.js'
import LinkedDriverDirectClientsList from './LinkedDriverDirectClientsList.jsx'
import { toLinkedDriverLink } from './linkedDriverLink.js'
import './linked-driver.css'

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
export default function LinkedDriverClientsPage({ ownerKey = 'guest', onBack, showToast }) {
  const navigate = useNavigate()
  const { linkId: rawLinkId } = useParams()
  const linkId = decodeURIComponent(rawLinkId || '')
  const drivers = useOwnerDrivers(ownerKey)
  const cars = useOwnerCars(ownerKey)
  const clients = useOwnerClients(ownerKey)
  const practiceSettings = useOwnerSettings(ownerKey)

  const driver = drivers.find((item) => item.id === linkId) || null
  const link = driver ? toLinkedDriverLink(driver) : null
  const car = (cars || []).find((item) => item.number === link?.vehicleNumber) || null
  const mode = getEffectiveDriverSettlementMode(car, practiceSettings)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(/** @type {string|null} */ (null))
  const [draft, setDraft] = useState(emptyDraft)
  const [pendingDelete, setPendingDelete] = useState(/** @type {ClientLike|null} */ (null))

  const isDriverDirect = mode === 'driver_direct'
  const scopeKey = car?.number || ''

  function handleBack() {
    if (onBack) onBack()
    else navigate(-1)
  }

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

  if (!driver || driver.status !== 'linked' || !link) {
    return (
      <div className="page client-management-page">
        <div className="settings-header">
          <button type="button" className="icon-btn" title="뒤로가기" onClick={handleBack}>
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <div className="settings-title">기사 거래처</div>
          <div style={{ width: 40 }}></div>
        </div>
        <div className="linked-driver-empty">연동된 기사 정보를 찾을 수 없습니다.</div>
      </div>
    )
  }

  const title = `${link.driverName || '기사'} 기사 거래처`
  const scopedClients = clients.filter((c) => scopeKey && c.scopedToVehicleNumber === scopeKey)

  return (
    <div className="page client-management-page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={handleBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">{title}</div>
        <div style={{ width: 40 }}></div>
      </div>

      {isDriverDirect ? (
        <LinkedDriverDirectClientsList supabaseLinkId={driver.supabaseId} />
      ) : (
        <>
          <div className="client-list" id="linkedDriverClientsListContainer">
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
        </>
      )}
    </div>
  )
}
