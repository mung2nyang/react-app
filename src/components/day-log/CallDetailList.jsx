// @ts-check
import { callFareTotal, callVatTotal } from '../../domain/day-record.js'
import { getDetailPaymentSummary } from '../../lib/finance.js'
import { commissionInfo } from './callDetailFormHelpers.js'
import CallDetailCard from './CallDetailCard.jsx'

/** @typedef {import('./dayLogTypes.js').CallDetailLike} CallDetailLike */
/** @typedef {import('./dayLogTypes.js').ClientLike} ClientLike */
/** @typedef {import('./dayLogTypes.js').PaymentSummary} PaymentSummary */
/** @typedef {import('./dayLogTypes.js').Settings} Settings */

/**
 * @param {Object} props
 * @param {Array<CallDetailLike>} props.details
 * @param {Settings} props.settings
 * @param {Array<ClientLike>} props.clients
 * @param {(id: string) => void} props.onEdit
 * @param {(id: string) => void} props.onDelete
 * @param {(id: string) => void} props.onTogglePayment
 * @param {(id: string) => void} props.onMessage
 * @param {() => void} props.onAdd
 */
export default function CallDetailList({ details, settings, clients, onEdit, onDelete, onTogglePayment, onMessage, onAdd }) {
  const callFare = callFareTotal({ isOff: false, callDetails: details })
  const callVat = callVatTotal({ isOff: false, callDetails: details })
  const totalDistance = details.reduce((sum, item) => sum + (parseFloat(item.distanceKm || '') || 0), 0)
  const totalCommission = details.reduce((sum, item) => sum + commissionInfo(item).amount, 0)
  const grandTotal = callFare - totalCommission + callVat

  return (
    <div className="modal-section call-detail-section">
      <div className="modal-section-title">
        <span>운행 일지 세부 입력</span>
        <button type="button" className="compact-add-btn" onClick={onAdd}>+ 추가</button>
      </div>
      {details.map((item) => (
        <CallDetailCard
          key={item.id}
          item={item}
          payment={/** @type {PaymentSummary} */ (getDetailPaymentSummary(item))}
          settings={settings}
          client={clients.find((entry) => entry.companyName === item.client)}
          onEdit={() => onEdit(item.id)}
          onDelete={() => onDelete(item.id)}
          onTogglePayment={() => onTogglePayment(item.id)}
          onMessage={() => onMessage(item.id)}
        />
      ))}
      {details.length > 0 && (
        <div className="call-detail-daily-summary">
          <div><b>일일 운행거리</b><strong>{totalDistance} km</strong></div>
          {totalCommission > 0 && (
            <div className="commission-row"><b>수수료</b><strong>- {totalCommission.toLocaleString('ko-KR')}원</strong></div>
          )}
          <div><b>부가세(공급가액 기준 10%)</b><strong>{callVat.toLocaleString('ko-KR')}원</strong></div>
          <div className="summary-grand-total">
            <b>세부 내역 합계 ({details.length}건)</b>
            <strong>{grandTotal.toLocaleString('ko-KR')}원</strong>
          </div>
        </div>
      )}
      <div className="call-detail-add-row">
        <button type="button" className="call-detail-add-btn" onClick={onAdd}>+ 운행 일지 추가</button>
      </div>
    </div>
  )
}
