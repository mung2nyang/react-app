// @ts-check
import { formatWon } from '../lib/money.js'

/** @typedef {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */

/**
 * @param {Object} props
 * @param {Array<InvoiceLike>} props.entries
 * @param {'draft'|'issued'} props.tab
 * @param {'sales'|'purchase'|'commission'} props.flow
 * @param {string} props.emptyDraft
 * @param {{ completeLabel: string }} props.flowMeta
 * @param {(item: InvoiceLike) => void} props.onOpenDraft
 * @param {(item: InvoiceLike, status: 'draft'|'issued') => void} props.onChangeStatus
 */
export default function TaxInvoiceEntryList({
  entries, tab, flow, emptyDraft, flowMeta, onOpenDraft, onChangeStatus,
}) {
  if (entries.length === 0) {
    return (
      <div className="empty-state">
        {tab === 'issued' ? `${flowMeta.completeLabel} 내역이 없습니다.` : emptyDraft}
      </div>
    )
  }
  return entries.map((item) => (
    <div key={item.id} className="management-list-card">
      <div className="management-card-copy">
        <div className="client-card-title"><strong>{item.clientName}</strong></div>
        <div className="car-sub-text">{item.count || 0}건 · {item.clientBizNumber || '사업자번호 미입력'}</div>
        {item.vehicleLabel && <div className="car-sub-text">{item.vehicleLabel}</div>}
        {item.partyType === 'driver' && (
          <div className="car-sub-text">
            {item.carNumber} · 운송료 {formatWon(item.grossAmount || 0)}
            {item.commissionAmount ? ` · 수수료 ${formatWon(item.commissionAmount)}` : ''}
            {item.insuranceAmount ? ` · 산재보험 ${formatWon(item.insuranceAmount)}` : ''}
          </div>
        )}
        <div className="receivable-group-summary">
          <span>공급가 {formatWon(item.supplyAmount)}</span>
          <span>세액 {formatWon(item.taxAmount)}</span>
          <strong>{formatWon(item.totalAmount)}</strong>
        </div>
      </div>
      <div className="receivable-card-actions">
        <button type="button" className="action-icon-btn" onClick={() => onOpenDraft(item)}>
          {item.status === 'issued' ? '내용 보기' : (flow === 'purchase' ? '내용 입력' : '작성하기')}
        </button>
        {item.status === 'issued'
          ? <button type="button" className="action-icon-btn del" onClick={() => onChangeStatus(item, 'draft')}>{flow === 'purchase' ? '수취 취소' : '발급 취소'}</button>
          : <button type="button" className="action-icon-btn" onClick={() => onChangeStatus(item, 'issued')}>{flowMeta.completeLabel}</button>}
      </div>
    </div>
  ))
}
