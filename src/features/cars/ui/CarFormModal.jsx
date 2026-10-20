// @ts-check
import { useState } from 'react'
import { checkCarDraft } from '../../../domain/cars.js'
import { formatPhoneNumber, tonnageDigits, tonnageValue } from '../../../lib/formatPhone.js'
import { formatCurrencyInput, formatPercentInput } from '../../../lib/money.js'
import CarDriverConnectPanel from './CarDriverConnectPanel.jsx'
import CarDriverIncomeFields from './CarDriverIncomeFields.jsx'
import ClearableInput from '../../../shared/ui/ClearableInput.jsx'
import CurrencyInput from '../../../shared/ui/CurrencyInput.jsx'
import FieldError, { focusField, invalidProps } from '../../../shared/ui/FieldError.jsx'
import ModalShell from '../../../shared/ui/ModalShell.jsx'
import CarShareBaseField from './CarShareBaseField.jsx'

/**
 * @typedef {Object} CarFormDraft
 * @property {string} number
 * @property {string} tonnage
 * @property {'main'|'sub'} type
 * @property {string} driverName
 * @property {string} driverPhone
 * @property {string} driverPayMode
 * @property {string} driverSalaryAmount
 * @property {boolean} commEnabled
 * @property {string} commType
 * @property {string} commission
 * @property {boolean} [insuranceOn]
 * @property {'employee'|'business'} [driverIncomeType]
 * @property {boolean} [withholdingOn]
 * @property {string} [expenseRate]
 * @property {string} [insuranceRate]
 * @property {'gross'|'afterClientCommission'} [driverShareBase]
 * @property {string} inviteCode
 * @property {string} inviteStartDate
 * @property {string|null} inviteDriverId
 * @property {'link'|'log'} connectMode
 */
/** @typedef {NonNullable<ReturnType<typeof checkCarDraft>>} CarProblem */

const INPUT_IDS = { number: 'newCarNumber', driverName: 'newDriverName', driverPhone: 'newUserPhone', driverSalaryAmount: 'newCarSettlementValue' }

/**
 * @param {Object} props
 * @param {CarFormDraft} props.draft
 * @param {import('react').Dispatch<import('react').SetStateAction<CarFormDraft>>} props.setDraft
 * @param {string|null} props.editingId
 * @param {() => void} props.onCancel
 * @param {() => void} props.onSave
 * @param {boolean} [props.cloud]
 * @param {Array<import('../../../data/sync/syncTypes.js').DriverRecord>} [props.drivers]
 */
export default function CarFormModal({
  draft, setDraft, editingId, onCancel, onSave,
  cloud = false, drivers = [],
}) {
  const isSub = draft.type === 'sub'
  const isSalary = draft.driverPayMode === 'salary'
  const showConnect = isSub && cloud
  const [problem, setProblem] = useState(/** @type {(CarProblem & { value: string })|null} */ (null))
  // 문제 칸 값을 고치기 시작하면 표시를 거둔다.
  const shown = problem && String(draft[problem.field] ?? '') === problem.value ? problem : null

  function handleSave() {
    // 기사 연동 탭 사전 검사는 CarListPage.jsx save()와 같은 조건.
    const found = checkCarDraft(draft, { linkRequired: showConnect && draft.connectMode === 'link' })
    if (!found) {
      setProblem(null)
      onSave()
      return
    }
    setProblem({ ...found, value: String(draft[found.field] ?? '') })
    focusField(INPUT_IDS[found.field])
  }

  function setRevenueMode() {
    setDraft((prev) => ({
      ...prev,
      driverPayMode: 'revenue',
      commEnabled: true,
      commType: 'percent',
    }))
  }

  function setSalaryMode() {
    setDraft((prev) => ({
      ...prev,
      driverPayMode: 'salary',
      commEnabled: false,
      commission: '',
    }))
  }

  /** @param {string} value */
  function onCommissionChange(value) {
    setDraft((prev) => ({
      ...prev,
      commission: formatPercentInput(value),
    }))
  }

  return (
    <ModalShell onClose={onCancel} closeOnOverlay={false} closeOnEscape={false} contentClassName="modal-content car-modal" label="차량">
      <div className="modal-title">
        {editingId ? (isSub ? '기사 정보 수정' : '차량 수정') : (isSub ? '기사 등록' : '차량 등록')}
      </div>
      <div className="personal-inline-fields">
        <div className="form-group">
          <label htmlFor="newCarNumber">차량번호</label>
          <ClearableInput id="newCarNumber" className="input-box" placeholder="12가 3456" value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} {...invalidProps(shown, 'number', 'newCarNumber')} />
          <FieldError problem={shown} field="number" inputId="newCarNumber" />
        </div>
        <div className="form-group">
          <label htmlFor="newCarTonnage">차량 톤수</label>
          <div className="unit-input">
            <input id="newCarTonnage" className="input-box" inputMode="decimal" placeholder="예: 5, 11, 25" value={tonnageDigits(draft.tonnage)} onChange={(e) => setDraft({ ...draft, tonnage: tonnageValue(e.target.value) })} onBlur={() => setDraft({ ...draft, tonnage: tonnageValue(draft.tonnage, true) })} />
            <span className="unit-input-suffix">톤</span>
          </div>
        </div>
      </div>
      {isSub && (
        <>
          <div className="form-group">
            <label htmlFor="newDriverName">기사명</label>
            <ClearableInput id="newDriverName" className="input-box" placeholder="기사명을 입력하세요" value={draft.driverName} onChange={(e) => setDraft({ ...draft, driverName: e.target.value })} {...invalidProps(shown, 'driverName', 'newDriverName')} />
            <FieldError problem={shown} field="driverName" inputId="newDriverName" />
          </div>
          <div className="form-group">
            <label htmlFor="newUserPhone">연락처</label>
            <ClearableInput id="newUserPhone" className="input-box" type="tel" placeholder="010-0000-0000" value={draft.driverPhone} onChange={(e) => setDraft({ ...draft, driverPhone: formatPhoneNumber(e.target.value) })} {...invalidProps(shown, 'driverPhone', 'newUserPhone')} />
            <FieldError problem={shown} field="driverPhone" inputId="newUserPhone" />
          </div>
          <hr className="car-modal-divider" />
          <div className="form-group">
            <label htmlFor="newCarSettlementValue">정산</label>
            <p className="car-settlement-mode-guide">
              {isSalary
                ? '건당(또는 월) 고정으로 기사에게 지급할 금액을 설정합니다.'
                : '이 차량 매출 중 기사에게 지급할 비율(%)을 설정합니다.'}
            </p>
            <div className="car-commission-value">
              <div className="car-commission-type" role="group" aria-label="정산 방식">
                <button type="button" className={!isSalary ? 'active' : ''} aria-pressed={!isSalary} onClick={setRevenueMode}>매출제</button>
                <button type="button" className={isSalary ? 'active' : ''} aria-pressed={isSalary} onClick={setSalaryMode}>월급제</button>
              </div>
              <span className="car-commission-input">
                {isSalary ? (
                  <CurrencyInput
                    id="newCarSettlementValue"
                    placeholder="0"
                    value={formatCurrencyInput(draft.driverSalaryAmount)}
                    onValueChange={(next) => setDraft({ ...draft, driverSalaryAmount: next.replace(/\D/g, '') })}
                    {...invalidProps(shown, 'driverSalaryAmount', 'newCarSettlementValue')}
                  />
                ) : (
                  <input
                    id="newCarSettlementValue"
                    inputMode="decimal"
                    placeholder="0"
                    value={draft.commission}
                    onChange={(e) => onCommissionChange(e.target.value)}
                  />
                )}
                <b>{isSalary ? '원' : '%'}</b>
              </span>
            </div>
            <FieldError problem={shown} field="driverSalaryAmount" inputId="newCarSettlementValue" />
          </div>
          {!isSalary && draft.commType !== 'direct' && <CarShareBaseField value={draft.driverShareBase} onChange={(next) => setDraft({ ...draft, driverShareBase: next })} />}
          <hr className="car-modal-divider" />
          <CarDriverIncomeFields draft={draft} setDraft={setDraft} />
        </>
      )}
      {showConnect ? (
        <>
          <hr className="car-modal-divider" />
          <CarDriverConnectPanel
            tab={draft.connectMode || 'link'}
            onTab={(mode) => setDraft({ ...draft, connectMode: mode })}
            inviteCode={draft.inviteCode || ''}
            onInviteCode={(code) => setDraft({ ...draft, inviteCode: code })}
            drivers={drivers}
          />
        </>
      ) : (
        <p className="car-type-hint">{isSub ? '기사 차량으로 등록됩니다.' : '메인 차량으로 등록됩니다.'}</p>
      )}
      <div className="modal-btns">
        <button type="button" className="modal-btn cancel" onClick={onCancel}>취소</button>
        <button type="button" className="modal-btn confirm" onClick={handleSave}>저장</button>
      </div>
    </ModalShell>
  )
}
