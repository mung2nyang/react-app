// @ts-check
import { getPaymentTermLabel } from '../../lib/clients.js'
import CardActionButtons from '../shared/CardActionButtons.jsx'

/**
 * @param {Object} props
 * @param {import('../../domain/clientTypes.js').ClientLike} props.client
 * @param {boolean} [props.dragging]
 * @param {() => void} [props.onDragStart] 없으면 끌어서 순서 바꾸기 꺼짐(기사 거래처)
 * @param {(event: { preventDefault: () => void }) => void} [props.onDragOver]
 * @param {() => void} [props.onDrop]
 * @param {() => void} [props.onDragEnd]
 * @param {() => void} props.onEdit
 * @param {() => void} props.onDelete
 */
export default function ClientListItem({
  client, dragging = false, onDragStart, onDragOver, onDrop, onDragEnd, onEdit, onDelete,
}) {
  return (
    <div
      className={`management-list-card client-list-card${dragging ? ' client-dragging' : ''}`}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="management-card-copy">
        <div className="client-card-title">
          <strong>{client.companyName}</strong>
          {client.fixedRouteLinked && <span className="management-badge tax-invoice">고정노선 연동</span>}
        </div>
        {(client.isPinned || client.commEnabled || client.palletOn) && (
          <div className="client-card-badges">
            {client.isPinned && <span className="management-badge pinned">★ 즐겨찾기</span>}
            {client.commEnabled && (
              <span className="management-badge commission">
                수수료 {client.commType === 'direct' ? `${client.commValue || ''}원` : `${client.commValue || ''}%`}
              </span>
            )}
            {client.palletOn && (
              <span className="management-badge tax-invoice">파렛트 {client.palletPrice || ''}원</span>
            )}          </div>
        )}
        <div className="car-sub-text">
          <span>사업자 {client.bizNumber || '-'}</span>
          <span>연락처 {client.phone || '-'}</span>
        </div>
        <div className="car-sub-text">
          결제주기: {getPaymentTermLabel(client.paymentTerm, client.paymentTermValue)}
        </div>
      </div>
      <div className="car-action-btns">
        <CardActionButtons onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  )
}
