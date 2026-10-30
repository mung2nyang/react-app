// @ts-check
import { useRef, useState } from 'react'
import { checkClientDraft } from '../../../domain/clients.ts'
import { BIZ_NUMBER_PLACEHOLDER, formatBizNumber, formatPhoneNumber } from '../../../domain/formatPhone.ts'
import { needsPaymentTermValue, PAYMENT_TERMS } from '../../../domain/clients.ts'
import AppDropdown from '../../../shared/ui/AppDropdown.jsx'
import BizNumberHint from '../../../shared/ui/BizNumberHint.jsx'
import ClearableInput from '../../../shared/ui/ClearableInput.jsx'
import FieldError, { focusField, invalidProps } from '../../../shared/ui/FieldError.jsx'
import ClientTradeFields from './ClientTradeFields.jsx'
import { StarIcon } from '../../../shared/ui/icons.jsx'
import './client-management.css'
import ModalShell from '../../../shared/ui/ModalShell.jsx'

/** @typedef {import('../../../domain/clientTypes.ts').ClientDraft} ClientDraft */
/** @typedef {NonNullable<ReturnType<typeof checkClientDraft>>} ClientProblem */

// 이 창에 있는 칸만 표시 — 창에 없는 칸(고정 노선·파렛트 단가) 문제는 저장 함수가 지금처럼 알림으로.
/** @type {Partial<Record<ClientProblem['field'], string>>} */
const INPUT_IDS = { companyName: 'clientCompanyName', paymentTermValue: 'clientPaymentTermValue', commValue: 'clientCommValue' }

/** @param {ClientDraft} draft @param {ClientProblem['field']} field */
function valueOf(draft, field) {
  return String(draft[field] ?? '')
}

/**
 * @param {Object} props
 * @param {ClientDraft} props.draft
 * @param {import('react').Dispatch<import('react').SetStateAction<ClientDraft>>} props.setDraft
 * @param {string|null} props.editingId
 * @param {() => void} props.onCancel
 * @param {() => void|Promise<void>} props.onSave
 * @param {Array<import('../../../domain/clientTypes.ts').ClientLike>} [props.clients] 같은 이름 검사용
 */
export default function ClientFormModal({ draft, setDraft, editingId, onCancel, onSave, clients = [] }) {
  const termValueLabel = draft.paymentTerm === 'after_days' ? '며칠 후' : '날짜'
  const [problem, setProblem] = useState(/** @type {(ClientProblem & { value: string })|null} */ (null))
  // 문제 칸 값을 고치기 시작하면 표시를 거둔다.
  const shown = problem && valueOf(draft, problem.field) === problem.value ? problem : null

  const [saving, setSaving] = useState(false)
  // 저장 중엔 다시 눌러도 무시 — 같은 거래처가 두 번 생기지 않게.
  const busyRef = useRef(false)

  async function handleSave() {
    if (busyRef.current) return
    const found = checkClientDraft(draft, clients, editingId)
    const inputId = found ? INPUT_IDS[found.field] : undefined
    if (!found || !inputId) {
      setProblem(null)
      busyRef.current = true
      setSaving(true)
      try { await onSave() } finally { busyRef.current = false; setSaving(false) }
      return
    }
    setProblem({ ...found, value: valueOf(draft, found.field) })
    focusField(inputId)
  }

  return (
    <ModalShell onClose={onCancel} closeOnOverlay={false} closeOnEscape={false} contentClassName="modal-content client-modal" label="거래처">
      <div className="client-modal-header">
        <div className="modal-title">{editingId ? '거래처 수정' : '거래처 등록'}</div>
        <button type="button" className={`client-favorite-star${draft.isPinned ? ' active' : ''}`} aria-pressed={draft.isPinned} aria-label="즐겨찾기" onClick={() => setDraft({ ...draft, isPinned: !draft.isPinned })}>
          <StarIcon filled={!!draft.isPinned} />
        </button>
      </div>
      <div className="form-group">
        <label htmlFor="clientCompanyName">거래처명</label>
        <ClearableInput id="clientCompanyName" className="input-box" placeholder="거래처명 입력" value={draft.companyName || ''} onChange={(e) => setDraft({ ...draft, companyName: e.target.value })} {...invalidProps(shown, 'companyName', 'clientCompanyName')} />
        <FieldError problem={shown} field="companyName" inputId="clientCompanyName" />
      </div>
      <div className="personal-inline-fields">
        <div className="form-group">
          <label htmlFor="clientManagerName">담당자 이름</label>
          <ClearableInput id="clientManagerName" className="input-box" placeholder="담당자 이름 입력" value={draft.managerName || ''} onChange={(e) => setDraft({ ...draft, managerName: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="clientTaxRepresentative">대표자</label>
          <ClearableInput id="clientTaxRepresentative" className="input-box" placeholder="대표자명" value={draft.taxRepresentative || ''} onChange={(e) => setDraft({ ...draft, taxRepresentative: e.target.value })} />
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="clientPhone">연락처</label>
        <ClearableInput id="clientPhone" className="input-box" type="tel" placeholder="연락처 입력" value={draft.phone || ''} onChange={(e) => setDraft({ ...draft, phone: formatPhoneNumber(e.target.value) })} />
      </div>
      <div className="form-group">
        <label htmlFor="clientBizNumber">사업자등록번호</label>
        <ClearableInput id="clientBizNumber" className="input-box" inputMode="numeric" placeholder={BIZ_NUMBER_PLACEHOLDER} value={formatBizNumber(draft.bizNumber || '')} onChange={(e) => setDraft({ ...draft, bizNumber: formatBizNumber(e.target.value) })} />
        <BizNumberHint value={draft.bizNumber} />
      </div>
      <div className="personal-inline-fields">
        <div className="form-group">
          <label htmlFor="clientTaxBizType">업태</label>
          <ClearableInput id="clientTaxBizType" className="input-box" placeholder="예: 운수업" value={draft.taxBizType || ''} onChange={(e) => setDraft({ ...draft, taxBizType: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="clientTaxBizItem">종목</label>
          <ClearableInput id="clientTaxBizItem" className="input-box" placeholder="예: 화물운송" value={draft.taxBizItem || ''} onChange={(e) => setDraft({ ...draft, taxBizItem: e.target.value })} />
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="clientTaxAddress">사업장 주소</label>
        <ClearableInput id="clientTaxAddress" className="input-box" placeholder="사업장 주소" value={draft.taxAddress || ''} onChange={(e) => setDraft({ ...draft, taxAddress: e.target.value })} />
      </div>
      <div className="form-group">
        <label htmlFor="clientTaxEmail">이메일</label>
        <ClearableInput id="clientTaxEmail" className="input-box" type="email" placeholder="이메일" value={draft.taxEmail || ''} onChange={(e) => setDraft({ ...draft, taxEmail: e.target.value })} />
      </div>
      <div className="form-group">
        <label>결제 주기</label>
        <AppDropdown
          label="결제 주기"
          value={draft.paymentTerm || 'next_month_end'}
          options={PAYMENT_TERMS}
          onChange={(next) => setDraft({ ...draft, paymentTerm: next, paymentTermValue: '' })}
          className="app-dropdown-boxed"
        />
      </div>
      {needsPaymentTermValue(draft.paymentTerm) && (
        <div className="form-group">
          <label htmlFor="clientPaymentTermValue">{termValueLabel}</label>
          <input id="clientPaymentTermValue" className="input-box" inputMode="numeric" placeholder="숫자 입력" value={String(draft.paymentTermValue || '')} onChange={(e) => setDraft({ ...draft, paymentTermValue: e.target.value.replace(/\D/g, '') })} {...invalidProps(shown, 'paymentTermValue', 'clientPaymentTermValue')} />
          <FieldError problem={shown} field="paymentTermValue" inputId="clientPaymentTermValue" />
        </div>
      )}
      <ClientTradeFields draft={draft} setDraft={setDraft} problem={shown} />
      <div className="modal-btns">
        <button type="button" className="modal-btn cancel" onClick={onCancel}>취소</button>
        <button type="button" className="modal-btn confirm" disabled={saving} onClick={handleSave}>{saving ? '저장 중…' : '저장'}</button>
      </div>
    </ModalShell>
  )
}
