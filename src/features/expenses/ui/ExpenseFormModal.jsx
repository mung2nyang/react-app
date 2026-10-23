// @ts-check
import { useState } from 'react'
import { FUEL_TYPES, MAINT_CATEGORIES, MISC_CATEGORIES } from '../../../domain/expenses.ts'
import { checkExpenseDraft } from '../../../domain/expenseDraft.ts'
import { formatCurrencyInput, parseCurrencyValue } from '../../../domain/money.ts'
import TemporalInput from '../../../shared/ui/TemporalInput.jsx'
import ClearableInput from '../../../shared/ui/ClearableInput.jsx'
import CurrencyInput from '../../../shared/ui/CurrencyInput.jsx'
import FieldError, { focusField, invalidProps } from '../../../shared/ui/FieldError.jsx'
import './expense-form.css'
import ModalShell from '../../../shared/ui/ModalShell.jsx'

/** @typedef {import('../../../domain/expenseTypes.ts').ExpenseDraft} ExpenseDraft */
/** @typedef {NonNullable<ReturnType<typeof checkExpenseDraft>>} ExpenseProblem */

// 날짜는 창에서 비울 수 없어(기본값 오늘·일지에선 잠김) 표시하지 않고 저장 함수 알림으로.
const INPUT_IDS = { name: 'expenseName', cost: 'expenseCost' }

/**
 * @template {ExpenseDraft} T
 * @param {Object} props
 * @param {T} props.draft
 * @param {string|null} [props.editingId]
 * @param {boolean} [props.lockDate]
 * @param {string} props.kindLabel
 * @param {boolean} [props.inline]
 * @param {(next: T) => void} props.onChange
 * @param {() => void} props.onClose
 * @param {() => void} props.onSave
 * @param {boolean} [props.saving] 저장 중이면 [저장] 잠금
 */
export default function ExpenseFormModal({
  draft,
  editingId,
  lockDate = false,
  kindLabel,
  inline = false,
  onChange,
  onClose,
  onSave, saving = false,
}) {
  const categories = draft.kind === 'misc' ? MISC_CATEGORIES : MAINT_CATEGORIES
  const [problem, setProblem] = useState(/** @type {(ExpenseProblem & { value: string })|null} */ (null))
  // 문제 칸 값을 고치기 시작하면 표시를 거둔다.
  const shown = problem && String(draft[problem.field] ?? '') === problem.value ? problem : null

  function handleSave() {
    const found = checkExpenseDraft(draft)
    const inputId = found && found.field !== 'date' ? INPUT_IDS[found.field] : undefined
    setProblem(found && inputId ? { ...found, value: String(draft[found.field] ?? '') } : null)
    if (inputId) focusField(inputId)
    else onSave()
  }

  const formClass = `modal-content expense-form-content${inline ? '' : ' client-modal'}${inline ? ' inline-expense-form' : ''}`
  const fields = (
      <>
        <div className="modal-title">{editingId ? `${kindLabel} 수정` : `${kindLabel} 내역 추가`}</div>
        <div className="personal-inline-fields">
          <div className="form-group">
            <label htmlFor="expenseDate">날짜</label>
            <TemporalInput
              type="date"
              id="expenseDate"
              value={draft.date || ''}
              disabled={lockDate}
              centered
              onChange={(e) => onChange({ ...draft, date: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="expenseMileage">누적거리</label>
            <div className="input-with-suffix">
              <CurrencyInput
                id="expenseMileage"
                className="input-box"
                placeholder="0"
                value={formatCurrencyInput(draft.mileage)}
                onValueChange={(next) => onChange({ ...draft, mileage: parseCurrencyValue(next) })}
              />
              <span className="suffix">km</span>
            </div>
          </div>
        </div>

        {draft.kind !== 'fuel' && (
          <>
            <div className="form-group">
              <label htmlFor="expenseName">{draft.kind === 'misc' ? '항목명' : '정비 항목명'}</label>
              <ClearableInput id="expenseName" className="input-box" placeholder="항목명을 입력하세요" value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} {...invalidProps(shown, 'name', 'expenseName')} />
              <FieldError problem={shown} field="name" inputId="expenseName" />
            </div>
            <div className="form-group">
              <label>분류</label>
              <div className="pill-group">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`pill-btn${draft.category === cat ? ' active' : ''}`}
                    onClick={() => onChange({ ...draft, category: cat })}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {draft.kind === 'fuel' && (
          <div className="form-group expense-inline-field expense-inline-pills">
            <label>종류</label>
            <div className="pill-group">
              {FUEL_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`pill-btn${draft.fuelType === type ? ' active' : ''}`}
                  onClick={() => onChange({ ...draft, fuelType: type })}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="form-group expense-inline-field">
          <label htmlFor="expenseCost">비용</label>
          <div className="input-with-suffix">
            <CurrencyInput
              id="expenseCost"
              className="input-box"
              placeholder="비용을 입력하세요"
              value={formatCurrencyInput(draft.cost)}
              onValueChange={(next) => onChange({ ...draft, cost: parseCurrencyValue(next) })}
              {...invalidProps(shown, 'cost', 'expenseCost')}
            />
            <span className="suffix">원</span>
          </div>
          <FieldError problem={shown} field="cost" inputId="expenseCost" />
        </div>

        {draft.kind === 'fuel' && (
          <div className="personal-inline-fields expense-fuel-pair">
            <div className="form-group">
              <label htmlFor="expenseSubsidy">유가보조금</label>
              <div className="input-with-suffix">
                <CurrencyInput
                  id="expenseSubsidy"
                  className="input-box"
                  placeholder="0"
                  value={formatCurrencyInput(draft.subsidy)}
                  onValueChange={(next) => onChange({ ...draft, subsidy: parseCurrencyValue(next) })}
                />
                <span className="suffix">원</span>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="expenseLiters">주유량</label>
              <div className="input-with-suffix">
                <input id="expenseLiters" className="input-box" inputMode="decimal" placeholder="0" value={draft.liters} onChange={(e) => onChange({ ...draft, liters: e.target.value })} />
                <span className="suffix">L</span>
              </div>
            </div>
          </div>
        )}

        <div className="form-group expense-payment-row">
          <label>결제 방식</label>
          <div className="segment-control">
            {['카드', '현금'].map((pay) => (
              <button
                key={pay}
                type="button"
                className={`segment-btn${draft.payment === pay ? ' active' : ''}`}
                onClick={() => onChange({ ...draft, payment: pay })}
              >
                {pay}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-btns">
          <button type="button" className="modal-btn cancel" onClick={onClose}>취소</button>
          <button type="button" className="modal-btn confirm" disabled={saving} onClick={handleSave}>{saving ? '저장 중…' : '저장'}</button>
        </div>
      </>
  )

  if (inline) return <div className={formClass}>{fields}</div>

  return (
    <ModalShell onClose={onClose} closeOnOverlay={false} closeOnEscape={false} contentClassName={formClass} label={`${kindLabel} 내역`}>
      {fields}
    </ModalShell>
  )
}
