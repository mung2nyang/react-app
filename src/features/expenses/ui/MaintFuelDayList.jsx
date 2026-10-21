// @ts-check
// 차량 유지비 날짜별 내역 목록 — 그리기만 하고 저장은 화면(MaintFuelPage)이 한다.
import CardActionButtons from '../../../shared/ui/CardActionButtons.jsx'
import { expenseTitle } from '../../../domain/expenses.js'
import { formatWon } from '../../../domain/money.js'

/** @typedef {import('../../../domain/expenseTypes.js').ExpenseItem} ExpenseItem */

/** @param {{ kind: ExpenseItem['kind'] }} props */
function KindRecordIcon({ kind }) {
  if (kind === 'fuel') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <line x1="3" x2="15" y1="22" y2="22"></line>
        <line x1="4" x2="14" y1="9" y2="9"></line>
        <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"></path>
        <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5"></path>
      </svg>
    )
  }
  if (kind === 'misc') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h18M3 12h18M3 18h18"></path>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
    </svg>
  )
}

/**
 * @param {Object} props
 * @param {ReturnType<typeof import('../../../domain/expenses.js').groupExpensesByDate>} props.groups
 * @param {ExpenseItem['kind']} props.kind
 * @param {string} props.kindLabel
 * @param {(item: ExpenseItem) => void} props.onEdit
 * @param {(id: string) => void} props.onDelete
 */
export default function MaintFuelDayList({ groups, kind, kindLabel, onEdit, onDelete }) {
  return (
    <div className="car-list">
      {groups.length === 0 && <div className="empty-state">이번 달 등록된 {kindLabel} 내역이 없습니다.</div>}
      {groups.map((group) => (
        <section key={group.date} className={`management-day-card ${kind}-day`}>
          <div className="management-day-head">
            <strong>{group.date}</strong>
            <div>
              <span>{kindLabel} 합계</span>
              <b>{formatWon(group.dailyTotal)}</b>
            </div>
          </div>
          <div className="management-day-items">
            {group.items.map((item) => (
              <div key={item.id} className={`management-record-item ${kind}-record`}>
                <div className="management-record-head">
                  <div className="management-record-title">
                    <KindRecordIcon kind={kind} />
                    <strong>{expenseTitle(item, kindLabel)}</strong>
                  </div>
                  <div className="management-record-actions">
                    <CardActionButtons
                      onEdit={() => onEdit(item)}
                      onDelete={() => onDelete(item.id)}
                    />
                  </div>
                </div>
                <div className="management-record-info">
                  <div>
                    {item.kind !== 'fuel' && <span>{item.payment || '카드'}</span>}
                    {item.kind !== 'fuel' && item.category && <span>{item.category}</span>}
                    {item.kind === 'fuel' && (item.mileage || 0) > 0 && <span>누적 {(item.mileage || 0).toLocaleString('ko-KR')}km</span>}
                    {item.kind === 'fuel' && (item.subsidy || 0) > 0 && <span>보조금 {formatWon(item.subsidy)}</span>}
                    {item.kind !== 'fuel' && (item.mileage || 0) > 0 && <span>누적 {(item.mileage || 0).toLocaleString('ko-KR')}km</span>}
                  </div>
                  <strong>{formatWon(item.cost)}</strong>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
