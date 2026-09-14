// @ts-check
import { formatCurrencyInput } from '../../domain/money.js'

/**
 * @param {Object} props
 * @param {import('../../domain/financeTypes.js').CarLike} props.car
 * @param {Array<import('../../lib/outboxTypes.js').DriverRecord>} [props.drivers]
 * @param {boolean} [props.assignedView]
 * @param {boolean} [props.readOnly]
 * @param {() => void} [props.onEdit]
 * @param {() => void} [props.onDelete]
 */
export default function CarListItem({
  car,
  drivers = [],
  assignedView = false,
  readOnly = false,
  onEdit,
  onDelete,
}) {
  const isSub = car.type === 'sub'
  const hasDriverLink = isSub && drivers.some((d) => d.vehicleNumber === car.number)
  const commissionText = isSub && car.commEnabled && car.commission
    ? ` · 수수료 ${car.commType === 'direct' ? `${formatCurrencyInput(car.commission)}원` : `${car.commission}%`}`
    : ''
  const salaryText = isSub && car.driverPayMode === 'salary' && car.driverSalaryAmount
    ? ` · 월급 ${formatCurrencyInput(car.driverSalaryAmount)}원`
    : ''
  const subText = `${car.tonnage ? `(${car.tonnage})` : ''}${commissionText}${salaryText}`

  return (
    <div className="management-list-card">
      <div className="management-card-copy">
        <div className="car-info-text">
          <span className={`management-badge ${car.type === 'main' ? 'main' : 'sub'}`}>
            {car.type === 'main' ? '메인' : assignedView ? '배정차량' : '기사차량'}
          </span>
          {car.number}
          {isSub && car.driverName && ` [${car.driverName}]`}
          {hasDriverLink && <span className="management-badge log-enabled">기사연동</span>}
          {isSub && !hasDriverLink && <span className="management-badge log-enabled">운행일지</span>}
        </div>
        {subText && <div className="car-sub-text">{subText}</div>}
      </div>
      {!readOnly && (
        <div className="car-action-btns">
          <button type="button" className="action-icon-btn" onClick={onEdit}>수정</button>
          <button type="button" className="action-icon-btn del" onClick={onDelete}>삭제</button>
        </div>
      )}
    </div>
  )
}
