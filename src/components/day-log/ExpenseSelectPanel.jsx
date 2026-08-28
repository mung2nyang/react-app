// @ts-check
import { KINDS } from '../../lib/expenses.js'

/** @param {{ onPick: (kind: string) => void }} props */
export default function ExpenseSelectPanel({ onPick }) {
  return (
    <div className="modal-content maint-fuel-select-inline">
      <div className="expense-kind-pick">
        {KINDS.map((item) => (
          <button key={item.value} type="button" className="modal-btn confirm" onClick={() => onPick(item.value)}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
