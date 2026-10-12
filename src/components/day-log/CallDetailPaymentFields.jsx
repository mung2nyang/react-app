// @ts-check
// 콜상세 입력의 돈 관련 칸(계산서·입금 예정일, 부가세 없음, 산재보험료) — CallDetailForm에서 분리.
import { formatCurrencyInput } from '../../lib/money.js'
import TemporalInput from '../shared/TemporalInput.jsx'

const RECEIPT_PRESETS = ['전자', '일반', '카드', '현금', '송금']

/** @typedef {import('../../domain/call-details.js').CallDetailDraft} CallDetailDraft */

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
          <input id="callInsuranceFee" className="input-box" inputMode="numeric" placeholder="금액 입력" value={draft.insuranceFee} onChange={(e) => setDraft({ ...draft, insuranceFee: formatCurrencyInput(e.target.value) })} />
          <span className="suffix">원</span>
        </div>
      </div>
    </div>
  )
}

/**
 * 운송료 바로 아래 "부가세 없음" 줄.
 * @param {Object} props
 * @param {CallDetailDraft} props.draft
 * @param {(next: CallDetailDraft) => void} props.setDraft
 */
export function CallVatExemptRow({ draft, setDraft }) {
  return (
    <div className="call-vat-row">
      <label htmlFor="callVatExempt">부가세 없음</label>
      <label className="switch">
        <input id="callVatExempt" type="checkbox" checked={draft.vatExempt} onChange={(e) => setDraft({ ...draft, vatExempt: e.target.checked })} />
        <span className="slider"></span>
      </label>
    </div>
  )
}
