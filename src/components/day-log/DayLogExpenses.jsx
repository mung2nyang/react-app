// @ts-check
import { KINDS } from '../../lib/expenses.js'
import ExpenseFormModal from '../ExpenseFormModal.jsx'
import ExpenseGroups from './ExpenseGroups.jsx'
import ExpenseSelectPanel from './ExpenseSelectPanel.jsx'
import InlineSheet from './InlineSheet.jsx'

/** @type {Record<string, string>} */
const KIND_ADD_CLASS = { maint: 'maint-add-direct-btn', fuel: 'fuel-add-direct-btn', misc: 'misc-add-direct-btn' }

/** @typedef {import('./dayLogTypes.js').ExpenseItem} ExpenseItem */
/** @typedef {ReturnType<typeof import('./useExpenseForm.js').useExpenseForm>} ExpenseFormApi */

/**
 * @param {Object} props
 * @param {Array<ExpenseItem>} props.dayExpenses
 * @param {ExpenseFormApi} props.expenseForm
 * @param {() => void} props.onKindPick
 * @param {(kind: string) => void} props.onAdd
 * @param {(item: ExpenseItem) => void} props.onEdit
 */
export default function DayLogExpenses({ dayExpenses, expenseForm, onKindPick, onAdd, onEdit }) {
  return (
    <div className="modal-section maint-section">
      <div className="modal-section-title">
        <span>차량 정비/주유/기타</span>
        <button type="button" className="compact-add-btn" onClick={onKindPick}>+ 추가</button>
      </div>
      <ExpenseGroups dayExpenses={dayExpenses} onEdit={onEdit} onDelete={expenseForm.remove} />
      <div className="maint-fuel-add-row">
        {KINDS.map((item) => (
          <button key={item.value} type="button" className={`maint-fuel-add-btn ${KIND_ADD_CLASS[item.value]}`} onClick={() => onAdd(item.value)}>+ {item.label} 추가</button>
        ))}
      </div>
      <InlineSheet open={expenseForm.kindPick || expenseForm.modalOpen} className="maint-fuel-inline-host">
        {expenseForm.kindPick && <ExpenseSelectPanel onPick={onAdd} />}
        {expenseForm.modalOpen && (
          <ExpenseFormModal
            inline
            draft={expenseForm.draft}
            editingId={expenseForm.editingId}
            lockDate
            kindLabel={KINDS.find((item) => item.value === expenseForm.draft.kind)?.label || '정비'}
            onChange={expenseForm.setDraft}
            onClose={expenseForm.closeModal}
            onSave={expenseForm.save}
          />
        )}
      </InlineSheet>
    </div>
  )
}
