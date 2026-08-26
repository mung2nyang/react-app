import { useState } from 'react'
import ConfirmModal from './ConfirmModal.jsx'
import { formatPhoneNumber } from '../lib/formatPhone.js'
import {
  getPaymentTermLabel,
  loadClients,
  needsPaymentTermValue,
  PAYMENT_TERMS,
  removeClient,
  reorderClients,
  saveClients,
  upsertClient,
} from '../lib/clients.js'
import { deleteClientFromSupabase } from '../lib/cloudSync.js'

const emptyDraft = {
  companyName: '',
  managerName: '',
  phone: '',
  bizNumber: '',
  taxRepresentative: '',
  taxEmail: '',
  taxAddress: '',
  taxBizType: '',
  taxBizItem: '',
  paymentTerm: 'next_month_end',
  paymentTermValue: '',
  isPinned: false,
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

  function confirmRemove() {
    const client = pendingDelete
    if (!client) return
    persist(removeClient(clients, client.id))
    setPendingDelete(null)
    showToast?.('거래처를 삭제했습니다.')
    if (client.supabaseId) {
      deleteClientFromSupabase(client.supabaseId).catch((error) => {
        console.error('서버 거래처 삭제 실패(로컬 삭제는 반영됨, 다음 동기화 때 재확인 필요):', error)
      })
    }
  }

  const termValueLabel = draft.paymentTerm === 'after_days' ? '며칠 후' : '날짜'

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
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content client-modal" onClick={(e) => e.stopPropagation()}>
            <div className="client-modal-header">
              <div className="modal-title">{editingId ? '거래처 수정' : '거래처 등록'}</div>
              <button
                type="button"
                className={`client-favorite-star${draft.isPinned ? ' active' : ''}`}
                aria-pressed={draft.isPinned}
                aria-label="즐겨찾기"
                onClick={() => setDraft({ ...draft, isPinned: !draft.isPinned })}
              >
                {draft.isPinned ? '★' : '☆'}
              </button>
            </div>
            <div className="form-group">
              <label htmlFor="clientCompanyName">업체명 (거래처명)</label>
              <input
                id="clientCompanyName"
                className="input-box"
                placeholder="업체명 입력"
                value={draft.companyName}
                onChange={(e) => setDraft({ ...draft, companyName: e.target.value })}
              />
            </div>
            <div className="personal-inline-fields">
              <div className="form-group">
                <label htmlFor="clientManagerName">이름 (담당자)</label>
                <input
                  id="clientManagerName"
                  className="input-box"
                  placeholder="담당자 이름 입력"
                  value={draft.managerName}
                  onChange={(e) => setDraft({ ...draft, managerName: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="clientTaxRepresentative">대표자</label>
                <input
                  id="clientTaxRepresentative"
                  className="input-box"
                  placeholder="대표자명"
                  value={draft.taxRepresentative}
                  onChange={(e) => setDraft({ ...draft, taxRepresentative: e.target.value })}
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="clientPhone">연락처</label>
              <input
                id="clientPhone"
                className="input-box"
                type="tel"
                placeholder="연락처 입력"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: formatPhoneNumber(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="clientBizNumber">사업자 번호</label>
              <input
                id="clientBizNumber"
                className="input-box"
                placeholder="사업자 번호 입력"
                value={draft.bizNumber}
                onChange={(e) => setDraft({ ...draft, bizNumber: e.target.value })}
              />
            </div>
            <div className="personal-inline-fields">
              <div className="form-group">
                <label htmlFor="clientTaxBizType">업태</label>
                <input
                  id="clientTaxBizType"
                  className="input-box"
                  placeholder="예: 운수업"
                  value={draft.taxBizType}
                  onChange={(e) => setDraft({ ...draft, taxBizType: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="clientTaxBizItem">종목</label>
                <input
                  id="clientTaxBizItem"
                  className="input-box"
                  placeholder="예: 화물운송"
                  value={draft.taxBizItem}
                  onChange={(e) => setDraft({ ...draft, taxBizItem: e.target.value })}
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="clientTaxAddress">사업장 주소</label>
              <input
                id="clientTaxAddress"
                className="input-box"
                placeholder="사업장 주소"
                value={draft.taxAddress}
                onChange={(e) => setDraft({ ...draft, taxAddress: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="clientTaxEmail">이메일</label>
              <input
                id="clientTaxEmail"
                className="input-box"
                type="email"
                placeholder="이메일"
                value={draft.taxEmail}
                onChange={(e) => setDraft({ ...draft, taxEmail: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="clientPaymentTerm">결제 주기</label>
              <select
                id="clientPaymentTerm"
                className="input-box"
                value={draft.paymentTerm}
                onChange={(e) => setDraft({ ...draft, paymentTerm: e.target.value, paymentTermValue: '' })}
              >
                {PAYMENT_TERMS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
            {needsPaymentTermValue(draft.paymentTerm) && (
              <div className="form-group">
                <label htmlFor="clientPaymentTermValue">{termValueLabel}</label>
                <input
                  id="clientPaymentTermValue"
                  className="input-box"
                  inputMode="numeric"
                  placeholder="숫자 입력"
                  value={draft.paymentTermValue}
                  onChange={(e) => setDraft({ ...draft, paymentTermValue: e.target.value.replace(/\D/g, '') })}
                />
              </div>
            )}
            <p className="car-type-hint">즐겨찾기는 목록 위에 두고, 같은 그룹끼리 끌어 순서를 바꿀 수 있습니다. 로그인하면 서버의 핀·정렬 순서에도 반영됩니다.</p>
            <div className="modal-btns">
              <button type="button" className="modal-btn cancel" onClick={() => setModalOpen(false)}>취소</button>
              <button type="button" className="modal-btn confirm" onClick={save}>저장</button>
            </div>
          </div>
        </div>
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
