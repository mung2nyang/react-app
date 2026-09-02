// @ts-check
import { formatWon, formatCurrencyInput, parseCurrencyValue } from '../../lib/money.js'
import { formatWorkMonth, getDdayLabel, receivableItemKey } from '../../lib/receivables.js'

/**
 * @param {Object} props
 * @param {Object} props.item
 * @param {boolean} props.compact
 * @param {boolean} props.hasSubCars
 * @param {boolean} [props.saving]
 * @param {string} [props.partialKey]
 * @param {string} [props.partialAmount]
 * @param {string} [props.historyKey]
 * @param {(key: string) => void} [props.onTogglePartial]
 * @param {(value: string) => void} [props.onPartialAmountChange]
 * @param {() => void} [props.onConfirmPartial]
 * @param {(key: string) => void} [props.onToggleHistory]
 * @param {() => void} [props.onPayItem]
 * @param {() => void} [props.onUndoPayment]
 */
export default function ReceivableItemCard({
  item, compact, hasSubCars, saving = false, partialKey = '', partialAmount = '',
  historyKey = '', onTogglePartial, onPartialAmountChange, onConfirmPartial,
  onToggleHistory, onPayItem, onUndoPayment,
}) {
  const key = receivableItemKey(item)
  const isPartial = item.paymentSummaryStatus === 'partial'
  const payments = Array.isArray(item.payments) ? item.payments : []
  const dday = getDdayLabel(item.paymentDueDate)

  return (
    <div className="management-list-card receivable-detail-card">
      <div className="management-card-copy">
        {compact && <div className="client-card-title"><strong>{item.client}</strong></div>}
        {!compact && <div className="client-card-title"><strong>{formatWon(item.remainingAmount)}</strong></div>}
        {hasSubCars && <div className="car-sub-text">{item.logLabel}</div>}
        {!compact && (
          <div className="car-sub-text">
            {(item.loadLoc || item.unloadLoc)
              ? `${item.loadLoc || '상차지 미상'} → ${item.unloadLoc || '하차지 미상'}`
              : '운행 구간 미등록'}
          </div>
        )}
        <div className="car-sub-text">{item.workDate.replace(/-/g, '.')} · {formatWorkMonth(String(item.workDate).slice(0, 7))}</div>
        {item.paymentDueDate && <div className="car-sub-text">입금 예정일: {item.paymentDueDate.replace(/-/g, '.')}</div>}
        {dday && <div className={`receivable-dday${dday.includes('연체') ? ' overdue' : ''}`}>{dday}</div>}
        <div className={`receivable-payment-status ${isPartial ? 'partial' : 'unpaid'}`}>
          {isPartial ? `${formatWon(item.paidAmount)} 입금 · ${formatWon(item.remainingAmount)} 남음` : '미수'}
          <span> (전체 {formatWon(item.fare)})</span>
        </div>
        {compact && <strong className="receivable-amount">{formatWon(item.remainingAmount)}</strong>}
        {item.remarks && <div className="car-sub-text">{item.remarks}</div>}
        {payments.length > 0 && onToggleHistory && (
          <button type="button" className="action-icon-btn" onClick={() => onToggleHistory(key)}>
            입금 내역 {payments.length}건
          </button>
        )}
        {historyKey === key && payments.map((payment) => (
          <div key={payment.id || payment.paidAt} className="receivable-payment-history-row">
            <span>{payment.paidAt ? new Date(payment.paidAt).toLocaleString('ko-KR') : '-'}</span>
            <span>{formatWon(parseCurrencyValue(payment.amount))}</span>
          </div>
        ))}
      </div>
      {!compact && onPayItem && (
        <div className="car-action-btns">
          <button type="button" className="action-icon-btn" onClick={onPayItem} disabled={saving}>이 건 입금 완료</button>
          <button type="button" className="action-icon-btn" onClick={() => onTogglePartial?.(key)}>부분 입금</button>
          {payments.length > 0 && (
            <button type="button" className="action-icon-btn del" onClick={onUndoPayment}>취소</button>
          )}
        </div>
      )}
      {!compact && partialKey === key && onConfirmPartial && onPartialAmountChange && (
        <div className="receivable-partial-input-row">
          <input
            className="input-box"
            inputMode="numeric"
            placeholder="입금액 입력"
            value={formatCurrencyInput(partialAmount)}
            onChange={(e) => onPartialAmountChange(e.target.value)}
          />
          <button type="button" className="modal-btn confirm" onClick={onConfirmPartial} disabled={saving}>확인</button>
        </div>
      )}
    </div>
  )
}
