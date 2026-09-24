// @ts-check
import { formatWon } from '../lib/money.js'
import TemporalInput from './shared/TemporalInput.jsx'
import './tax-invoice/tax-invoice.css'

/** @typedef {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */

/**
 * @param {Object} props
 * @param {InvoiceLike} props.modalItem
 * @param {{ label: string, partyHeading: string }} props.flowMeta
 * @param {(next: InvoiceLike) => void} props.onChange
 * @param {() => void} props.onCancel
 * @param {() => void} props.onSave
 */
export default function TaxInvoiceDraftModal({ modalItem, flowMeta, onChange, onCancel, onSave }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content client-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{flowMeta.label} 계산서</div>
        <div className="form-group">
          <label htmlFor="invClient">{flowMeta.partyHeading}</label>
          <input id="invClient" className="input-box" value={modalItem.clientName || ''} readOnly />
        </div>
        <div className="form-group">
          <label htmlFor="invBiz">사업자등록번호</label>
          <input id="invBiz" className="input-box" value={modalItem.clientBizNumber || ''} onChange={(e) => onChange({ ...modalItem, clientBizNumber: e.target.value })} />
        </div>
        <div className="personal-inline-fields">
          <div className="form-group">
            <label htmlFor="invRep">대표자</label>
            <input id="invRep" className="input-box" value={modalItem.clientRepresentative || ''} onChange={(e) => onChange({ ...modalItem, clientRepresentative: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="invEmail">이메일</label>
            <input id="invEmail" className="input-box" value={modalItem.clientEmail || ''} onChange={(e) => onChange({ ...modalItem, clientEmail: e.target.value })} />
          </div>
        </div>
        <div className="personal-inline-fields">
          <div className="form-group">
            <label htmlFor="invBizType">업태</label>
            <input id="invBizType" className="input-box" value={modalItem.clientBizType || ''} onChange={(e) => onChange({ ...modalItem, clientBizType: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="invBizItem">종목</label>
            <input id="invBizItem" className="input-box" value={modalItem.clientBizItem || ''} onChange={(e) => onChange({ ...modalItem, clientBizItem: e.target.value })} />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="invAddress">사업장 주소</label>
          <input id="invAddress" className="input-box" value={modalItem.clientAddress || ''} onChange={(e) => onChange({ ...modalItem, clientAddress: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="invItem">품목</label>
          <input id="invItem" className="input-box" value={modalItem.itemName || ''} onChange={(e) => onChange({ ...modalItem, itemName: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="invDate">작성일자</label>
          <TemporalInput type="date" id="invDate" value={modalItem.issueDate || ''} onChange={(e) => onChange({ ...modalItem, issueDate: e.target.value })} />
        </div>
        <div className="tax-invoice-amount-grid">
          <div><span>공급가액</span><strong>{formatWon(modalItem.supplyAmount)}</strong></div>
          <div><span>세액</span><strong>{formatWon(modalItem.taxAmount)}</strong></div>
          <div className="total"><span>합계</span><strong>{formatWon(modalItem.totalAmount)}</strong></div>
        </div>
        <div className="form-group">
          <label htmlFor="invRemark">비고</label>
          <input id="invRemark" className="input-box" value={modalItem.remark || ''} onChange={(e) => onChange({ ...modalItem, remark: e.target.value })} />
        </div>
        <p className="car-type-hint">금액은 운행 일지 세부 입력에서 자동 집계됩니다. 실제 발급은 홈택스에서 해 주세요.</p>
        <div className="modal-btns">
          <button type="button" className="modal-btn cancel" onClick={onCancel}>취소</button>
          <button type="button" className="modal-btn confirm" onClick={onSave}>저장</button>
        </div>
      </div>
    </div>
  )
}
