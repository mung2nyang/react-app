// @ts-check
// 정비·주유·기타는 구조가 같고 라벨·클래스만 달라 kind로 나누는 한 컴포넌트로 둔다(3벌로 쪼개면 중복).
// 종류별 합계는 카드 목록 아래 요약 상자 하나에 모은다(운행 일지 세부 내역 합계와 같은 모양).
import { KINDS, expenseTitle } from '../../lib/expenses.js'
import { formatWon } from '../../domain/money.js'
import { ExpenseIcon, EditIcon, DeleteIcon } from './icons.jsx'

/** @type {Record<string, string>} */
const KIND_TITLE_CLASS = { maint: 'maint-title-color', fuel: 'fuel-title-color', misc: 'misc-title-color' }

/** @typedef {import('./dayLogTypes.js').ExpenseItem} ExpenseItem */

/**
 * @param {Object} props
 * @param {Array<ExpenseItem>} props.dayExpenses
 * @param {(item: ExpenseItem) => void} props.onEdit
 * @param {(id: string) => void} props.onDelete
 */
export default function ExpenseGroups({ dayExpenses, onEdit, onDelete }) {
  const groups = KINDS
    .map((kindItem) => {
      const items = dayExpenses.filter((item) => item.kind === kindItem.value)
      return { kindItem, items, total: items.reduce((sum, item) => sum + (Number(item.cost) || 0), 0) }
    })
    .filter((group) => group.items.length > 0)
  if (groups.length === 0) return null

  return (
    <>
      <div className="work-log-expense-group">
        {groups.flatMap(({ kindItem, items }) => items.map((item) => (
          <div key={item.id} className="maint-fuel-item">
            <div className="maint-fuel-head">
              <div className={`maint-fuel-title ${KIND_TITLE_CLASS[kindItem.value]}`}>
                <ExpenseIcon kind={/** @type {'maint'|'fuel'|'misc'} */ (kindItem.value)} />
                <strong>{expenseTitle(item, kindItem.label)}</strong>
              </div>
              <div className="maint-fuel-actions">
                <button type="button" className="action-icon-btn" title="수정" onClick={() => onEdit(item)}><EditIcon /></button>
                <button type="button" className="action-icon-btn del" title="삭제" onClick={() => onDelete(item.id)}><DeleteIcon /></button>
              </div>
            </div>
            <div className="maint-fuel-info">
              <div>
                {item.kind === 'fuel'
                  ? (item.liters ? <span className="maint-fuel-note">{item.liters}L</span> : null)
                  : <span className="maint-payment-badge">{item.payment || '카드'}</span>}
              </div>
              <strong>{formatWon(item.cost)}</strong>
            </div>
          </div>
        )))}
      </div>
      <div className="call-detail-daily-summary expense-daily-summary">
        {groups.map(({ kindItem, total }) => (
          <div key={kindItem.value}>
            <b>{kindItem.label} 합계</b>
            <strong>{formatWon(total)}</strong>
          </div>
        ))}
        <div className="summary-grand-total">
          <b>지출 합계</b>
          <strong>{formatWon(groups.reduce((sum, group) => sum + group.total, 0))}</strong>
        </div>
      </div>
    </>
  )
}
