// @ts-check
import { getPaymentTermLabel } from '../../lib/clients.js'
import CardActionButtons from '../shared/CardActionButtons.jsx'

const TAX_INFO_FIELDS = /** @type {const} */ (['bizNumber', 'taxRepresentative', 'taxAddress', 'taxBizType', 'taxBizItem', 'taxEmail'])

/**
 * 계산서 작성에 쓰는 세무정보 6칸이 전부 채워졌는지 — 이 카드 배지 전용.
 * @param {import('../../domain/clientTypes.js').ClientLike} client
 */
function hasCompleteTaxInfo(client) {
  return TAX_INFO_FIELDS.every((key) => String(client[key] || '').trim() !== '')
}

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
          {client.fixedRouteLinked && <span className="management-badge tax-invoice">고정노선 연동</span>}
          {hasCompleteTaxInfo(client) && <span className="management-badge tax-invoice">정보 작성 완료</span>}
        </div>
        {(client.isPinned || client.commEnabled || client.palletOn || client.managerName) && (
          <div className="client-card-badges">
            {client.isPinned && <span className="management-badge pinned">★ 즐겨찾기</span>}
            {client.commEnabled && (
              <span className="management-badge commission">
                수수료 {client.commType === 'direct' ? `${client.commValue || ''}원` : `${client.commValue || ''}%`}
              </span>
            )}
            {client.palletOn && (
              <span className="management-badge tax-invoice">파렛트 {client.palletPrice || ''}원</span>
            )}
            {client.managerName && <span>{client.managerName} 담당</span>}
          </div>
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
