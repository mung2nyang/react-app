// @ts-check
import { getPaymentTermLabel } from '../../lib/clients.js'

/**
 * @param {Object} props
 * @param {import('../../domain/clientTypes.js').ClientLike} props.client
 * @param {boolean} props.dragging
 * @param {() => void} props.onDragStart
 * @param {(event: { preventDefault: () => void }) => void} props.onDragOver
 * @param {() => void} props.onDrop
 * @param {() => void} props.onDragEnd
 * @param {() => void} props.onEdit
 * @param {() => void} props.onDelete
 */
export default function ClientListItem({
  client, dragging, onDragStart, onDragOver, onDrop, onDragEnd, onEdit, onDelete,
}) {
  return (
    <div
      className={`management-list-card client-list-card${dragging ? ' client-dragging' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="management-card-copy">
        <div className="client-card-title">
          <strong>{client.companyName}</strong>
          {client.isPinned && <span className="management-badge pinned">★ 즐겨찾기</span>}
          {client.fixedRouteLinked && <span className="management-badge tax-invoice">고정노선 연동</span>}
          {client.managerName && <span>{client.managerName} 담당</span>}
        </div>
        <div className="car-sub-text">
          <span>사업자 {client.bizNumber || '-'}</span>
          <span>연락처 {client.phone || '-'}</span>
        </div>
        <div className="car-sub-text">
          결제주기: {getPaymentTermLabel(client.paymentTerm, client.paymentTermValue)}
        </div>
      </div>
      <div className="car-action-btns">
        <button type="button" className="action-icon-btn" onClick={onEdit}>수정</button>
        <button type="button" className="action-icon-btn del" onClick={onDelete}>삭제</button>
      </div>
    </div>
  )
}
