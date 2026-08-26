import {
  FUEL_TYPES,
  MAINT_CATEGORIES,
  MISC_CATEGORIES,
} from '../lib/expenses.js'
import { formatCurrencyInput, parseCurrencyValue } from '../lib/money.js'

export default function ExpenseFormModal({
  draft,
  editingId,
  lockDate = false,
  kindLabel,
  inline = false,
  onChange,
  onClose,
  onSave,
}) {
  const categories = draft.kind === 'misc' ? MISC_CATEGORIES : MAINT_CATEGORIES

  const form = (
      <div className={`modal-content${inline ? '' : ' client-modal'}${inline ? ' inline-expense-form' : ''}`} onClick={inline ? undefined : (e) => e.stopPropagation()}>
        <div className="modal-title">{editingId ? `${kindLabel} 수정` : `${kindLabel} 내역 추가`}</div>
        <div className="form-group">
          <label htmlFor="expenseDate">날짜</label>
          <input
            id="expenseDate"
            type="date"
            className="input-box"
            value={draft.date}
            readOnly={lockDate}
            onChange={(e) => onChange({ ...draft, date: e.target.value })}
          />
        </div>

        {draft.kind !== 'fuel' && (
          <>
            <div className="form-group">
              <label htmlFor="expenseName">{draft.kind === 'misc' ? '항목명' : '정비 항목명'}</label>
              <input id="expenseName" className="input-box" placeholder="항목명을 입력하세요" value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
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
          <div className="form-group">
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

        <div className="form-group">
          <label htmlFor="expenseCost">비용 (원)</label>
          <input
            id="expenseCost"
            className="input-box"
            inputMode="numeric"
            placeholder="비용을 입력하세요"
            value={formatCurrencyInput(draft.cost)}
            onChange={(e) => onChange({ ...draft, cost: parseCurrencyValue(e.target.value) })}
          />
        </div>

        {draft.kind === 'fuel' && (
          <>
            <div className="form-group">
              <label htmlFor="expenseSubsidy">유가보조금</label>
              <input
                id="expenseSubsidy"
                className="input-box"
                inputMode="numeric"
                placeholder="0"
                value={formatCurrencyInput(draft.subsidy)}
                onChange={(e) => onChange({ ...draft, subsidy: parseCurrencyValue(e.target.value) })}
              />
            </div>
            <div className="personal-inline-fields">
              <div className="form-group">
                <label htmlFor="expenseLiters">주유량 (L)</label>
                <input id="expenseLiters" className="input-box" inputMode="decimal" placeholder="0" value={draft.liters} onChange={(e) => onChange({ ...draft, liters: e.target.value })} />
              </div>
              <div className="form-group">
                <label htmlFor="expenseMileage">누적거리 (km)</label>
                <input
                  id="expenseMileage"
                  className="input-box"
                  inputMode="numeric"
                  placeholder="0"
                  value={formatCurrencyInput(draft.mileage)}
                  onChange={(e) => onChange({ ...draft, mileage: parseCurrencyValue(e.target.value) })}
                />
              </div>
            </div>
          </>
        )}

        {draft.kind !== 'fuel' && (
          <>
            <div className="form-group">
              <label htmlFor="expenseMileage">누적거리 (km)</label>
              <input
                id="expenseMileage"
                className="input-box"
                inputMode="numeric"
                placeholder="0"
                value={formatCurrencyInput(draft.mileage)}
                onChange={(e) => onChange({ ...draft, mileage: parseCurrencyValue(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label>결제 방식</label>
              <div className="settings-segmented-control">
                {['카드', '현금'].map((pay) => (
                  <button
                    key={pay}
                    type="button"
                    className={`toggle-btn${draft.payment === pay ? ' active-work' : ''}`}
                    onClick={() => onChange({ ...draft, payment: pay })}
                  >
                    {pay}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <p className="car-type-hint">정비·기타는 항목명 또는 비용만 있어도 저장됩니다.</p>
        <div className="modal-btns">
          <button type="button" className="modal-btn cancel" onClick={onClose}>취소</button>
          <button type="button" className="modal-btn confirm" onClick={onSave}>저장</button>
        </div>
      </div>
  )

  if (inline) return form

  return (
    <div className="modal-overlay" onClick={onClose}>
      {form}
    </div>
  )
}
