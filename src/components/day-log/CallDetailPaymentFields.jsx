// @ts-check
// 콜상세 입력의 돈 관련 칸(계산서·입금 예정일, 부가세 없음, 산재보험료) — CallDetailForm에서 분리.
import CurrencyInput from '../shared/CurrencyInput.jsx'
import TemporalInput from '../shared/TemporalInput.jsx'
import './call-detail-payment.css'

const RECEIPT_PRESETS = ['전자', '일반', '카드', '현금', '송금']

/** @typedef {typeof import('./callDetailFormHelpers.js').emptyDraft} CallDetailDraft 폼 입력 중 초안(CallDetailForm 상태와 같은 모양) */

/**
 * @param {Object} props
 * @param {CallDetailDraft} props.draft
 * @param {(next: CallDetailDraft) => void} props.setDraft
 * @param {string} props.paymentGuide 입금 예정일 아래 안내(거래처 결제 조건)
 */
export default function CallDetailPaymentFields({ draft, setDraft, paymentGuide }) {
  return (
    <div className="call-detail-panel call-receipt-panel">
      <label>계산서</label>
      <div className="call-receipt-group">
        {RECEIPT_PRESETS.map((name) => (
          <button key={name} type="button" className={`dark-pill-btn${draft.receipt === name ? ' active' : ''}`} onClick={() => setDraft({ ...draft, receipt: draft.receipt === name ? '' : name })}>{name}</button>
        ))}
      </div>
      <div className="payment-due-date-box">
        <div className="form-group">
          <label htmlFor="callPaymentDueDate">입금 예정일</label>
          <TemporalInput type="date" id="callPaymentDueDate" value={draft.paymentDueDate} centered onChange={(e) => setDraft({ ...draft, paymentDueDate: e.target.value })} />
        </div>
        <p className="payment-term-guide">{paymentGuide}</p>
      </div>
    </div>
  )
}

/**
 * @param {Object} props
 * @param {CallDetailDraft} props.draft
 * @param {(next: CallDetailDraft) => void} props.setDraft
 */
export function CallInsuranceFeeField({ draft, setDraft }) {
  return (
    <div className="call-detail-panel">
      <div className="call-inline-field">
        <label htmlFor="callInsuranceFee">산재보험료</label>
        <div className="input-with-suffix">
          <CurrencyInput id="callInsuranceFee" className="input-box" placeholder="금액 입력" value={draft.insuranceFee} onValueChange={(insuranceFee) => setDraft({ ...draft, insuranceFee })} />
          <span className="suffix">원</span>
        </div>
      </div>
    </div>
  )
}

/**
 * 운송료 바로 아래 작은 "부가세 없음(면세)" 체크 칸 — 드물게 쓰는 설정이라 토글 대신 작게.
 * @param {Object} props
 * @param {CallDetailDraft} props.draft
 * @param {(next: CallDetailDraft) => void} props.setDraft
 */
export function CallVatExemptRow({ draft, setDraft }) {
  return (
    <label className="call-vat-check" htmlFor="callVatExempt">
      <input id="callVatExempt" type="checkbox" checked={draft.vatExempt} onChange={(e) => setDraft({ ...draft, vatExempt: e.target.checked })} />
      <span>부가세 없음(면세)</span>
    </label>
  )
}
