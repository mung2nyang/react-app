// @ts-check
// 기사차량 폼의 "기사 유형·산재보험·원천징수(3.3%)·필요경비율·산재보험료율" 블록(CarFormModal에서 분리).
// 계산 규칙은 domain/driverIncomeDeductions.js, 값은 draft에만 두고 저장은 차량 저장 경로가 한다.
import { formatPercentInput } from '../../lib/money.js'
import { EXPENSE_RATE_PRESETS } from '../../domain/driverIncomeDeductions.js'
import AppDropdown from '../shared/AppDropdown.jsx'

const PRESET_OPTIONS = [
  { value: '', label: '품목·차종 선택' },
  ...EXPENSE_RATE_PRESETS.map((preset, index) => ({ value: String(index), label: `${preset.label} · ${preset.rate}%` })),
]

/**
 * @param {Object} props
 * @param {import('./CarFormModal.jsx').CarFormDraft} props.draft
 * @param {import('react').Dispatch<import('react').SetStateAction<import('./CarFormModal.jsx').CarFormDraft>>} props.setDraft
 */
export default function CarDriverIncomeFields({ draft, setDraft }) {
  const isEmployee = draft.driverIncomeType === 'employee'

  /** 유형을 고르면 두 토글 기본값이 함께 정해진다(사업소득자: 둘 다 켬, 근로자: 둘 다 끔). 이후 개별로 고칠 수 있다. */
  function setType(/** @type {'employee'|'business'} */ type) {
    const on = type === 'business'
    setDraft((prev) => ({ ...prev, driverIncomeType: type, insuranceOn: on, withholdingOn: on }))
  }

  return (
    <>
      <div className="form-group">
        <label>기사 유형</label>
        <p className="car-settlement-mode-guide">
          {isEmployee
            ? '4대보험 근로자는 산재보험료를 차주가 전액 부담하고, 3.3% 세금은 떼지 않습니다.'
            : '3.3% 사업소득자는 산재보험료를 차주와 기사가 반반 부담하고, 기사 정산액에서 3.3% 세금을 뗍니다.'}
        </p>
        <div className="car-commission-type" role="group" aria-label="기사 유형">
          <button type="button" className={isEmployee ? 'active' : ''} aria-pressed={isEmployee} onClick={() => setType('employee')}>4대보험 근로자</button>
          <button type="button" className={!isEmployee ? 'active' : ''} aria-pressed={!isEmployee} onClick={() => setType('business')}>3.3% 사업소득자</button>
        </div>
      </div>
      <div className="setting-item">
        <div className="car-option-copy">
          <label htmlFor="newCarInsuranceOn">산재보험 적용</label>
          <p>켜면 산재보험료의 기사 부담분(50%)을 기사 정산액에서 뺍니다. 끄면 차주가 전액 부담합니다.</p>
        </div>
        <label className="switch">
          <input id="newCarInsuranceOn" type="checkbox" checked={!!draft.insuranceOn} onChange={(e) => setDraft((prev) => ({ ...prev, insuranceOn: e.target.checked }))} />
          <span className="slider"></span>
        </label>
      </div>
      <div className="setting-item">
        <div className="car-option-copy">
          <label htmlFor="newCarWithholdingOn">원천징수 (3.3%)</label>
          <p>켜면 기사 정산액의 3.3%를 사업소득세로 떼고 지급합니다.</p>
        </div>
        <label className="switch">
          <input id="newCarWithholdingOn" type="checkbox" checked={!!draft.withholdingOn} onChange={(e) => setDraft((prev) => ({ ...prev, withholdingOn: e.target.checked }))} />
          <span className="slider"></span>
        </label>
      </div>
      <div className="form-group">
        <label htmlFor="newCarExpenseRate">필요경비율</label>
        <p className="car-settlement-mode-guide">산재보험료를 계산할 때 쓰는 고시 비율입니다. 품목·차종을 고르면 기본값이 채워지고, 직접 고칠 수 있습니다.</p>
        <div className="car-income-rate-row">
          <AppDropdown
            label="품목·차종"
            value=""
            options={PRESET_OPTIONS}
            className="app-dropdown-boxed"
            onChange={(next) => {
              if (next !== '') setDraft((prev) => ({ ...prev, expenseRate: EXPENSE_RATE_PRESETS[Number(next)].rate }))
            }}
          />
          <div className="car-commission-input">
            <input id="newCarExpenseRate" inputMode="decimal" placeholder="30.5" value={String(draft.expenseRate ?? '')} onChange={(e) => setDraft((prev) => ({ ...prev, expenseRate: formatPercentInput(e.target.value) }))} />
            <b>%</b>
          </div>
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="newCarInsuranceRate">산재보험료율</label>
        <p className="car-settlement-mode-guide">매년 1월 1일 바뀌는 법정 요율입니다. 직접 고칠 수 있고, 0을 넣으면 산재보험료를 계산하지 않습니다.</p>
        <div className="car-commission-input">
          <input id="newCarInsuranceRate" inputMode="decimal" placeholder="1.8" value={String(draft.insuranceRate ?? '')} onChange={(e) => setDraft((prev) => ({ ...prev, insuranceRate: formatPercentInput(e.target.value) }))} />
          <b>%</b>
        </div>
      </div>
    </>
  )
}
