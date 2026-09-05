// @ts-check
import { formatPhoneNumber } from '../../lib/formatPhone.js'
import { needsPaymentTermValue, PAYMENT_TERMS } from '../../lib/clients.js'
import ClientTradeFields from './ClientTradeFields.jsx'

/** @typedef {import('../../domain/clientTypes.js').ClientDraft} ClientDraft */

/**
 * @param {Object} props
 * @param {ClientDraft} props.draft
 * @param {import('react').Dispatch<import('react').SetStateAction<ClientDraft>>} props.setDraft
 * @param {string|null} props.editingId
 * @param {() => void} props.onCancel
 * @param {() => void} props.onSave
 * @param {boolean} [props.hideFixedRoute]
 */
export default function ClientFormModal({ draft, setDraft, editingId, onCancel, onSave, hideFixedRoute = false }) {
  const termValueLabel = draft.paymentTerm === 'after_days' ? '며칠 후' : '날짜'

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content client-modal" onClick={(e) => e.stopPropagation()}>
        <div className="client-modal-header">
          <div className="modal-title">{editingId ? '거래처 수정' : '거래처 등록'}</div>
          <button type="button" className={`client-favorite-star${draft.isPinned ? ' active' : ''}`} aria-pressed={draft.isPinned} aria-label="즐겨찾기" onClick={() => setDraft({ ...draft, isPinned: !draft.isPinned })}>
            {draft.isPinned ? '★' : '☆'}
          </button>
        </div>
        <div className="form-group">
          <label htmlFor="clientCompanyName">업체명 (거래처명)</label>
          <input id="clientCompanyName" className="input-box" placeholder="업체명 입력" value={draft.companyName || ''} onChange={(e) => setDraft({ ...draft, companyName: e.target.value })} />
        </div>
        <div className="personal-inline-fields">
          <div className="form-group">
            <label htmlFor="clientManagerName">이름 (담당자)</label>
            <input id="clientManagerName" className="input-box" placeholder="담당자 이름 입력" value={draft.managerName || ''} onChange={(e) => setDraft({ ...draft, managerName: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="clientTaxRepresentative">대표자</label>
            <input id="clientTaxRepresentative" className="input-box" placeholder="대표자명" value={draft.taxRepresentative || ''} onChange={(e) => setDraft({ ...draft, taxRepresentative: e.target.value })} />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="clientPhone">연락처</label>
          <input id="clientPhone" className="input-box" type="tel" placeholder="연락처 입력" value={draft.phone || ''} onChange={(e) => setDraft({ ...draft, phone: formatPhoneNumber(e.target.value) })} />
        </div>
        <div className="form-group">
          <label htmlFor="clientBizNumber">사업자 번호</label>
          <input id="clientBizNumber" className="input-box" placeholder="사업자 번호 입력" value={draft.bizNumber || ''} onChange={(e) => setDraft({ ...draft, bizNumber: e.target.value })} />
        </div>
        <div className="personal-inline-fields">
          <div className="form-group">
            <label htmlFor="clientTaxBizType">업태</label>
            <input id="clientTaxBizType" className="input-box" placeholder="예: 운수업" value={draft.taxBizType || ''} onChange={(e) => setDraft({ ...draft, taxBizType: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="clientTaxBizItem">종목</label>
            <input id="clientTaxBizItem" className="input-box" placeholder="예: 화물운송" value={draft.taxBizItem || ''} onChange={(e) => setDraft({ ...draft, taxBizItem: e.target.value })} />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="clientTaxAddress">사업장 주소</label>
          <input id="clientTaxAddress" className="input-box" placeholder="사업장 주소" value={draft.taxAddress || ''} onChange={(e) => setDraft({ ...draft, taxAddress: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="clientTaxEmail">이메일</label>
          <input id="clientTaxEmail" className="input-box" type="email" placeholder="이메일" value={draft.taxEmail || ''} onChange={(e) => setDraft({ ...draft, taxEmail: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="clientPaymentTerm">결제 주기</label>
          <select id="clientPaymentTerm" className="input-box" value={draft.paymentTerm || 'next_month_end'} onChange={(e) => setDraft({ ...draft, paymentTerm: e.target.value, paymentTermValue: '' })}>
            {PAYMENT_TERMS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        {needsPaymentTermValue(draft.paymentTerm) && (
          <div className="form-group">
            <label htmlFor="clientPaymentTermValue">{termValueLabel}</label>
            <input id="clientPaymentTermValue" className="input-box" inputMode="numeric" placeholder="숫자 입력" value={String(draft.paymentTermValue || '')} onChange={(e) => setDraft({ ...draft, paymentTermValue: e.target.value.replace(/\D/g, '') })} />
          </div>
        )}
        <ClientTradeFields draft={draft} setDraft={setDraft} hideFixedRoute={hideFixedRoute} />
        <p className="car-type-hint">즐겨찾기는 목록 위에 두고, 같은 그룹끼리 끌어 순서를 바꿀 수 있습니다. 로그인하면 서버의 핀·정렬 순서에도 반영됩니다.</p>
        <div className="modal-btns">
          <button type="button" className="modal-btn cancel" onClick={onCancel}>취소</button>
          <button type="button" className="modal-btn confirm" onClick={onSave}>저장</button>
        </div>
      </div>
    </div>
  )
}
