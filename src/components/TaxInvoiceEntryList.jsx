// @ts-check
import { formatWon } from '../lib/money.js'
import './tax-invoice/tax-invoice.css'

/** @typedef {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */

/**
 * @param {Object} props
 * @param {Array<InvoiceLike>} props.entries
 * @param {'draft'|'issued'} props.tab
 * @param {'sales'|'purchase'|'commission'} props.flow
 * @param {string} props.emptyDraft
 * @param {{ completeLabel: string }} props.flowMeta
 * @param {(item: InvoiceLike) => void} props.onOpenDraft
 * @param {(item: InvoiceLike) => void} [props.onExportExcel]
 * @param {(item: InvoiceLike, status: 'draft'|'issued') => void} props.onChangeStatus
 */
export default function TaxInvoiceEntryList({
  entries, tab, flow, emptyDraft, flowMeta, onOpenDraft, onExportExcel, onChangeStatus,
}) {
  if (entries.length === 0) {
    return (
      <div className="empty-state">
        {tab === 'issued' ? `${flowMeta.completeLabel} 내역이 없습니다.` : emptyDraft}
      </div>
    )
  }
  return entries.map((item) => (
    <div key={item.id} className="tax-invoice-entry-card">
      <div className="tax-invoice-entry-head">
        <strong>{item.clientName}</strong>
        <span className="management-badge">
          {tab === 'issued' ? flowMeta.completeLabel : (flow === 'purchase' ? '수취 전' : '작성 전')}
        </span>
      </div>
      <div className="car-sub-text">{item.count || 0}건 · {item.clientBizNumber || '사업자번호 미입력'}</div>
      {item.vehicleLabel && <div className="car-sub-text">{item.vehicleLabel}</div>}
      {item.partyType === 'driver' && (
        <div className="car-sub-text">
          {item.carNumber} · 운송료 {formatWon(item.grossAmount || 0)}
          {item.commissionAmount ? ` · 수수료 ${formatWon(item.commissionAmount)}` : ''}
          {item.insuranceAmount ? ` · 산재보험 ${formatWon(item.insuranceAmount)}` : ''}
        </div>
      )}
      <div className="tax-invoice-amount-box">
        <div className="tax-invoice-amount-row">
          <span>공급가액 {formatWon(item.supplyAmount)}</span>
          <span>세액 {formatWon(item.taxAmount)}</span>
        </div>
        <div className="tax-invoice-amount-row total">
          <span>합계</span>
          <strong>{formatWon(item.totalAmount)}</strong>
        </div>
      </div>
      <div className="tax-invoice-entry-actions">
        <button type="button" className="tax-invoice-action-btn" onClick={() => onOpenDraft(item)}>
          {item.status === 'issued' ? '내용 보기' : (flow === 'purchase' ? '내용 입력' : '작성하기')}
        </button>
        <button type="button" className="tax-invoice-action-btn" onClick={() => onExportExcel?.(item)}>엑셀 저장</button>
        {item.status === 'issued'
          ? <button type="button" className="tax-invoice-action-btn danger" onClick={() => onChangeStatus(item, 'draft')}>{flow === 'purchase' ? '수취 취소' : '발급 취소'}</button>
          : <button type="button" className="tax-invoice-action-btn primary" onClick={() => onChangeStatus(item, 'issued')}>{flowMeta.completeLabel}</button>}
      </div>
    </div>
  ))
}
