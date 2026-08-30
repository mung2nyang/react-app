// @ts-check
/**
 * @param {Object} props
 * @param {import('../../domain/financeTypes.js').CarLike} props.car
 * @param {() => void} props.onEdit
 * @param {() => void} props.onDelete
 */
export default function CarListItem({ car, onEdit, onDelete }) {
  return (
    <div className="management-list-card">
      <div className="management-card-copy">
        <div className="car-info-text">
          <span className={`management-badge ${car.type === 'main' ? 'main' : 'sub'}`}>
            {car.type === 'main' ? '메인' : '기사차량'}
          </span>
          {car.number}
        </div>
        {car.tonnage && <div className="car-sub-text">({car.tonnage})</div>}
        {car.type === 'sub' && car.driverName && (
          <div className="car-sub-text">{car.driverName} · {car.driverPhone || '-'}</div>
        )}
      </div>
      <div className="car-action-btns">
        <button type="button" className="action-icon-btn" onClick={onEdit}>수정</button>
        <button type="button" className="action-icon-btn del" onClick={onDelete}>삭제</button>
      </div>
    </div>
  )
}
