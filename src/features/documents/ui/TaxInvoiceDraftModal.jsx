// @ts-check
import { useState } from 'react'
import { BIZ_NUMBER_PLACEHOLDER, formatBizNumber } from '../../../domain/formatPhone.js'
import { formatWon } from '../../../domain/money.js'
import { checkTaxInvoiceDraft } from '../api/taxInvoiceActions.js'
import BizNumberHint from '../../../shared/ui/BizNumberHint.jsx'
import ClearableInput from '../../../shared/ui/ClearableInput.jsx'
import TemporalInput from '../../../shared/ui/TemporalInput.jsx'
import './tax-invoice.css'
import ModalShell from '../../../shared/ui/ModalShell.jsx'
import FieldError, { focusField, invalidProps } from '../../../shared/ui/FieldError.jsx'

/** @typedef {import('../../../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */

const INPUT_IDS = { clientBizNumber: 'invBiz', issueDate: 'invDate' }

/**
 * @param {Object} props
 * @param {InvoiceLike} props.modalItem
 * @param {{ label: string, partyHeading: string }} props.flowMeta
 * @param {(next: InvoiceLike) => void} props.onChange
 * @param {() => void} props.onCancel
 * @param {() => void} props.onSave
 */
export default function TaxInvoiceDraftModal({ modalItem, flowMeta, onChange, onCancel, onSave }) {
  const [problem, setProblem] = useState(/** @type {ReturnType<typeof checkTaxInvoiceDraft>} */ (null))
  // 문제 칸을 채우면 표시를 거둔다.
  const shown = problem && !modalItem[problem.field] ? problem : null
  const dateProps = invalidProps(shown, 'issueDate', 'invDate')

  function handleSave() {
    const found = checkTaxInvoiceDraft(modalItem)
    setProblem(found)
    if (found) {
      focusField(INPUT_IDS[found.field])
      return
    }
    onSave()
  }

  return (
    <ModalShell onClose={onCancel} closeOnOverlay={false} closeOnEscape={false} contentClassName="modal-content client-modal" label="세금계산서 작성">
      <div className="modal-title">{flowMeta.label} 계산서</div>
      <div className="form-group">
        <label htmlFor="invClient">{flowMeta.partyHeading}</label>
        <input id="invClient" className="input-box" value={modalItem.clientName || ''} readOnly />
      </div>
      <div className="form-group">
        <label htmlFor="invBiz">사업자등록번호</label>
        <ClearableInput id="invBiz" className="input-box" inputMode="numeric" placeholder={BIZ_NUMBER_PLACEHOLDER} value={formatBizNumber(modalItem.clientBizNumber || '')} onChange={(e) => onChange({ ...modalItem, clientBizNumber: formatBizNumber(e.target.value) })} {...invalidProps(shown, 'clientBizNumber', 'invBiz')} />
        <FieldError problem={shown} field="clientBizNumber" inputId="invBiz" />
        <BizNumberHint value={modalItem.clientBizNumber} />
      </div>
      <div className="personal-inline-fields">
        <div className="form-group">
          <label htmlFor="invRep">대표자</label>
          <ClearableInput id="invRep" className="input-box" value={modalItem.clientRepresentative || ''} onChange={(e) => onChange({ ...modalItem, clientRepresentative: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="invEmail">이메일</label>
          <ClearableInput id="invEmail" className="input-box" value={modalItem.clientEmail || ''} onChange={(e) => onChange({ ...modalItem, clientEmail: e.target.value })} />
        </div>
      </div>
      <div className="personal-inline-fields">
        <div className="form-group">
          <label htmlFor="invBizType">업태</label>
          <ClearableInput id="invBizType" className="input-box" value={modalItem.clientBizType || ''} onChange={(e) => onChange({ ...modalItem, clientBizType: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="invBizItem">종목</label>
          <ClearableInput id="invBizItem" className="input-box" value={modalItem.clientBizItem || ''} onChange={(e) => onChange({ ...modalItem, clientBizItem: e.target.value })} />
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="invAddress">사업장 주소</label>
        <ClearableInput id="invAddress" className="input-box" value={modalItem.clientAddress || ''} onChange={(e) => onChange({ ...modalItem, clientAddress: e.target.value })} />
      </div>
      <div className="form-group">
        <label htmlFor="invItem">품목</label>
        <ClearableInput id="invItem" className="input-box" value={modalItem.itemName || ''} onChange={(e) => onChange({ ...modalItem, itemName: e.target.value })} />
      </div>
      <div className="form-group">
        <label htmlFor="invDate">작성일자</label>
        <TemporalInput type="date" id="invDate" value={modalItem.issueDate || ''} onChange={(e) => onChange({ ...modalItem, issueDate: e.target.value })} invalid={Boolean(dateProps['aria-invalid'])} describedBy={dateProps['aria-describedby']} />
        <FieldError problem={shown} field="issueDate" inputId="invDate" />
      </div>
      <div className="tax-invoice-amount-grid">
        <div><span>공급가액</span><strong>{formatWon(modalItem.supplyAmount)}</strong></div>
        <div><span>세액</span><strong>{formatWon(modalItem.taxAmount)}</strong></div>
        <div className="total"><span>합계</span><strong>{formatWon(modalItem.totalAmount)}</strong></div>
      </div>
      <div className="form-group">
        <label htmlFor="invRemark">비고</label>
        <ClearableInput id="invRemark" className="input-box" value={modalItem.remark || ''} onChange={(e) => onChange({ ...modalItem, remark: e.target.value })} />
      </div>
      <p className="car-type-hint">금액은 운행일지 세부 입력에서 자동 집계됩니다. 실제 발급은 홈택스에서 해 주세요.</p>
      <div className="modal-btns">
        <button type="button" className="modal-btn cancel" onClick={onCancel}>취소</button>
        <button type="button" className="modal-btn confirm" onClick={handleSave}>저장</button>
      </div>
    </ModalShell>
  )
}
