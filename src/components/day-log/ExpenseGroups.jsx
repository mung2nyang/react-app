// @ts-check
// Step 6(일지 재작성): migration-plan.md는 MaintSummary/FuelSummary/MiscSummary를
// 3개 파일로 나누라고 제안하지만, 세 종류가 렌더 구조는 완전히 같고 라벨/클래스만
// kind로 달라진다(원래 WorkLogPage.jsx도 KINDS.map(...) 하나로 처리했다) — 3벌로
// 쪼개면 오히려 중복이 생겨서, 기존처럼 kind로 매개변수화한 한 컴포넌트로 유지한다
// (Step 5의 useCalendarDays 생략과 같은 종류의, 문서로 남기는 의도적 이탈).
import { KINDS, expenseTitle } from '../../lib/expenses.js'
import { formatWon } from '../../domain/money.js'
import { ExpenseIcon, EditIcon, DeleteIcon } from './icons.jsx'

/** @type {Record<string, string>} */
const KIND_TITLE_CLASS = { maint: 'maint-title-color', fuel: 'fuel-title-color', misc: 'misc-title-color' }
/** @type {Record<string, string>} */
const KIND_TOTAL_CLASS = { maint: 'maint-total-color', fuel: 'fuel-total-color', misc: 'misc-total-color' }

/** @typedef {import('./dayLogTypes.js').ExpenseItem} ExpenseItem */

/**
 * @param {Object} props
 * @param {Array<ExpenseItem>} props.dayExpenses
 * @param {(item: ExpenseItem) => void} props.onEdit
 * @param {(id: string) => void} props.onDelete
 */
export default function ExpenseGroups({ dayExpenses, onEdit, onDelete }) {
  return (
    <>
      {KINDS.map((kindItem) => {
        const kindItems = dayExpenses.filter((item) => item.kind === kindItem.value)
        if (kindItems.length === 0) return null
        const kindTotal = kindItems.reduce((sum, item) => sum + (Number(item.cost) || 0), 0)
        return (
          <div key={kindItem.value} className="work-log-expense-group">
            {kindItems.map((item) => (
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
            ))}
            <div className={`maint-fuel-total ${KIND_TOTAL_CLASS[kindItem.value]}`}>
              <strong>{kindItem.label} 합계</strong>
              <strong>{formatWon(kindTotal)}</strong>
            </div>
          </div>
        )
      })}
    </>
  )
}
