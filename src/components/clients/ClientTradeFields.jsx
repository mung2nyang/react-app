// @ts-check
import { formatPercentInput } from '../../lib/money.js'
import CurrencyInput from '../shared/CurrencyInput.jsx'
import FieldError, { invalidProps } from '../shared/FieldError.jsx'

/**
 * @param {Object} props
 * @param {import('../../domain/clientTypes.js').ClientDraft} props.draft
 * @param {import('react').Dispatch<import('react').SetStateAction<import('../../domain/clientTypes.js').ClientDraft>>} props.setDraft
 * @param {import('../shared/FieldError.jsx').FieldProblem|null} [props.problem] 저장 전 검사에서 걸린 칸
 */
// 고정노선 연동·파렛트 단가는 앱 설정 "거래처 연결"(FixedRouteClientLink)로 옮겼다 — 저장된 값은 draft로 보존된다.
export default function ClientTradeFields({ draft, setDraft, problem = null }) {
  const commInvalid = invalidProps(problem, 'commValue', 'clientCommValue')
  /** @param {'percent'|'direct'} nextType */
  function setCommType(nextType) {
    setDraft({
      ...draft,
      commType: nextType,
      commValue: draft.commType === nextType ? draft.commValue : '',
    })
  }

  return (
    <>
      <div className="setting-item">
        <div className="car-option-copy">
          <label htmlFor="clientCommToggle">수수료 적용</label>
        </div>
        <label className="switch">
          <input
            id="clientCommToggle"
            type="checkbox"
            checked={!!draft.commEnabled}
            onChange={(e) => setDraft({ ...draft, commEnabled: e.target.checked })}
          />
          <span className="slider"></span>
        </label>
      </div>
      {draft.commEnabled && (
        <div className="car-commission-value client-commission-value">
          <div className="car-commission-type" role="group" aria-label="수수료 방식">
            <button type="button" className={draft.commType === 'percent' ? 'active' : ''} aria-pressed={draft.commType === 'percent'} onClick={() => setCommType('percent')}>퍼센트</button>
            <button type="button" className={draft.commType === 'direct' ? 'active' : ''} aria-pressed={draft.commType === 'direct'} onClick={() => setCommType('direct')}>금액</button>
          </div>
          <span className="car-commission-input">
            {draft.commType === 'direct' ? (
              <CurrencyInput id="clientCommValue" placeholder="0" value={String(draft.commValue || '')} onValueChange={(commValue) => setDraft({ ...draft, commValue })} {...commInvalid} />
            ) : (
              <input
                id="clientCommValue"
                inputMode="decimal"
                placeholder="0"
                value={String(draft.commValue || '')}
                onChange={(e) => setDraft({ ...draft, commValue: formatPercentInput(e.target.value) })}
                {...commInvalid}
              />
            )}
            <b>{draft.commType === 'direct' ? '원' : '%'}</b>
          </span>
        </div>
      )}
      {draft.commEnabled && <FieldError problem={problem} field="commValue" inputId="clientCommValue" />}
    </>
  )
}
