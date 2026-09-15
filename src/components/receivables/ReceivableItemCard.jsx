// @ts-check
import { formatWon, formatCurrencyInput, parseCurrencyValue } from '../../lib/money.js'
import { formatWorkMonth, getDdayLabel, receivableItemKey } from '../../lib/receivables.js'

/** @typedef {import('../../domain/financeReceivables.js').ReceivableItemLike} ReceivableItemLike */
/** @typedef {import('../../domain/callDetail.js').PaymentLike} PaymentLike */

/**
 * @param {Object} props
 * @param {ReceivableItemLike} props.item
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
  const carBadge = hasSubCars && item.logLabel ? (
    <span className={`management-badge car-type${item.logId === 'main' ? ' main' : ''}`}>
      {item.logLabel}
    </span>
  ) : null

  if (compact) {
    return (
      <div className="receivable-item-card">
        <div className="receivable-item-row">
          <div>
            <div className="receivable-item-client">{item.client}</div>
            {carBadge && <div className="receivable-item-car">{carBadge}</div>}
            <div className="receivable-item-info">{formatWorkMonth(String(item.workDate).slice(0, 7))}</div>
            {item.paymentDueDate && (
              <div className="receivable-item-info">입금 예정일: {item.paymentDueDate.replace(/-/g, '.')}</div>
            )}
            {dday && <div className={`receivable-dday${dday.includes('연체') ? ' overdue' : ''}`}>{dday}</div>}
          </div>
          <div className="receivable-item-amount">{formatWon(item.remainingAmount)}</div>
        </div>
      </div>
    )
  }

  const route = (item.loadLoc || item.unloadLoc)
    ? <>{item.loadLoc || '상차지 미상'}<span>→</span>{item.unloadLoc || '하차지 미상'}</>
    : '운행 구간 미등록'

  return (
    <article className="receivable-detail-item">
      <div className="receivable-detail-item-top">
        <time dateTime={item.workDate}>{String(item.workDate || '').replace(/-/g, '.')}</time>
        <strong>{formatWon(item.remainingAmount)}</strong>
      </div>
      {carBadge && <div className="receivable-detail-car">{carBadge}</div>}
      <div className="receivable-detail-route">{route}</div>
      <div className="receivable-detail-due">
        {item.paymentDueDate
          ? <><span>입금 예정 {item.paymentDueDate.replace(/-/g, '.')}</span>{dday && <b>{dday}</b>}</>
          : <span>입금 예정일 미등록</span>}
      </div>
      {item.remarks && <p className="receivable-detail-remarks">{item.remarks}</p>}
      <div className={`receivable-payment-status ${isPartial ? 'partial' : 'unpaid'}`}>
        {isPartial
          ? `${formatWon(item.paidAmount)} 입금 · ${formatWon(item.remainingAmount)} 남음`
          : '미수'}
        <span className="receivable-original-fare"> (전체 {formatWon(item.fare)})</span>
      </div>
      {payments.length > 0 && onToggleHistory && (
        <button type="button" className="receivable-history-toggle-btn" onClick={() => onToggleHistory(key)}>
          입금 내역 보기 ({payments.length}건)
        </button>
      )}
      {historyKey === key && (
        <div className="receivable-payment-history">
          {payments.map((/** @type {PaymentLike} */ payment) => (
            <div key={payment.id || payment.paidAt} className="receivable-payment-history-row">
              <span>{payment.paidAt ? new Date(payment.paidAt).toLocaleString('ko-KR') : '-'}</span>
              <span>{formatWon(parseCurrencyValue(payment.amount))}</span>
            </div>
          ))}
        </div>
      )}
      {onPayItem && (
        <div className="receivable-item-actions">
          <button type="button" className="receivable-item-paid-btn" onClick={onPayItem} disabled={saving}>
            이 건 입금 완료
          </button>
          <button type="button" className="receivable-item-partial-btn" onClick={() => onTogglePartial?.(key)}>
            부분 입금 처리
          </button>
          {payments.length > 0 && onUndoPayment && (
            <button type="button" className="receivable-item-undo-btn" onClick={onUndoPayment}>취소</button>
          )}
        </div>
      )}
      {partialKey === key && onConfirmPartial && onPartialAmountChange && (
        <div className="receivable-partial-input-row">
          <input
            className="input-box"
            inputMode="numeric"
            placeholder="입금액 입력"
            value={formatCurrencyInput(partialAmount)}
            onChange={(e) => onPartialAmountChange(e.target.value)}
          />
          <button type="button" className="receivable-partial-confirm-btn" onClick={onConfirmPartial} disabled={saving}>
            확인
          </button>
        </div>
      )}
    </article>
  )
}
