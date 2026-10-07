// @ts-check
// 기사차량 폼의 "기사 유형·산재보험·원천징수(3.3%)·필요경비율·산재보험료율" 블록(CarFormModal에서 분리).
// 계산 규칙은 domain/driverIncomeDeductions.js, 값은 draft에만 두고 저장은 차량 저장 경로가 한다.
import { formatPercentInput } from '../../lib/money.js'
import { DEFAULT_EXPENSE_RATE, DEFAULT_INSURANCE_RATE } from '../../domain/driverIncomeDeductions.js'
import InfoTip from '../shared/InfoTip.jsx'

const INSURANCE_RATE_INFO = `매년 1월 1일 변경되는 법정 요율(${DEFAULT_INSURANCE_RATE}%)입니다. 직접 수정할 수 있으며, '0' 입력 시 계산에서 제외됩니다.`
const EXPENSE_RATE_INFO = `산재보험료를 계산할 때 쓰는 고시 비율입니다(기본 ${DEFAULT_EXPENSE_RATE}%). 직접 수정할 수 있습니다.
특수차량(살수차·카고크레인·렉카차)은 43.1%로 고쳐주세요.`

/**
 * @param {Object} props
 * @param {import('./CarFormModal.jsx').CarFormDraft} props.draft
 * @param {import('react').Dispatch<import('react').SetStateAction<import('./CarFormModal.jsx').CarFormDraft>>} props.setDraft
 */
export default function CarDriverIncomeFields({ draft, setDraft }) {
  const isEmployee = draft.driverIncomeType === 'employee'

  /** 유형이 산재 부담(근로자: 차주 전액, 사업소득자: 반반)과 원천징수 기본값을 정한다. 산재 토글은 그대로. */
  function setType(/** @type {'employee'|'business'} */ type) {
    setDraft((prev) => ({ ...prev, driverIncomeType: type, withholdingOn: type === 'business' }))
  }

  /** 산재 끄면 두 요율 0·숨김, 켜면 기본값으로 다시 채워 보인다. */
  function setInsuranceOn(/** @type {boolean} */ on) {
    setDraft((prev) => ({
      ...prev,
      insuranceOn: on,
      insuranceRate: on ? DEFAULT_INSURANCE_RATE : '0',
      expenseRate: on ? DEFAULT_EXPENSE_RATE : '0',
    }))
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
          <p>{isEmployee
            ? '켜면 산재보험료를 계산하고, 4대보험 근로자는 차주가 전액 부담합니다.'
            : '켜면 산재보험료를 계산하고, 3.3% 사업소득자는 차주와 기사가 반반 부담합니다(기사 몫은 정산액에서 뺌).'}</p>
        </div>
        <label className="switch">
          <input id="newCarInsuranceOn" type="checkbox" checked={!!draft.insuranceOn} onChange={(e) => setInsuranceOn(e.target.checked)} />
          <span className="slider"></span>
        </label>
      </div>
      {draft.insuranceOn && <div className="car-income-rate-row">
        <div className="form-group">
          <div className="car-income-rate-label">
            <label htmlFor="newCarInsuranceRate">산재보험료율</label>
            <InfoTip name="산재보험료율" info={INSURANCE_RATE_INFO} />
          </div>
          <div className="car-commission-input">
            <input id="newCarInsuranceRate" inputMode="decimal" placeholder={DEFAULT_INSURANCE_RATE} value={String(draft.insuranceRate ?? '')} onChange={(e) => setDraft((prev) => ({ ...prev, insuranceRate: formatPercentInput(e.target.value) }))} />
            <b>%</b>
          </div>
        </div>
        <div className="form-group">
          <div className="car-income-rate-label">
            <label htmlFor="newCarExpenseRate">필요경비율</label>
            <InfoTip name="필요경비율" info={EXPENSE_RATE_INFO} />
          </div>
          <div className="car-commission-input">
            <input id="newCarExpenseRate" inputMode="decimal" placeholder={DEFAULT_EXPENSE_RATE} value={String(draft.expenseRate ?? '')} onChange={(e) => setDraft((prev) => ({ ...prev, expenseRate: formatPercentInput(e.target.value) }))} />
            <b>%</b>
          </div>
        </div>
      </div>}
      <div className="setting-item">
        <div className="car-option-copy">
          <label htmlFor="newCarWithholdingOn">원천징수 (3.3%)</label>
          <p>켜면 정산 금액에서 사업소득세 3.3%를 공제한 실수령액으로 계산됩니다.</p>
        </div>
        <label className="switch">
          <input id="newCarWithholdingOn" type="checkbox" checked={!!draft.withholdingOn} onChange={(e) => setDraft((prev) => ({ ...prev, withholdingOn: e.target.checked }))} />
          <span className="slider"></span>
        </label>
      </div>
    </>
  )
}
