// @ts-check
import { formatCurrencyInput, formatPercentInput } from '../../lib/money.js'

/**
 * @param {Object} props
 * @param {import('../../domain/clientTypes.js').ClientDraft} props.draft
 * @param {import('react').Dispatch<import('react').SetStateAction<import('../../domain/clientTypes.js').ClientDraft>>} props.setDraft
 */
// 고정노선 연동·파렛트 단가는 앱 설정 "거래처 연결"(FixedRouteClientLink)로 옮겼다 — 저장된 값은 draft로 보존된다.
export default function ClientTradeFields({ draft, setDraft }) {
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
            <input
              id="clientCommValue"
              inputMode={draft.commType === 'direct' ? 'numeric' : 'decimal'}
              placeholder="0"
              value={String(draft.commValue || '')}
              onChange={(e) => setDraft({
                ...draft,
                commValue: draft.commType === 'direct' ? formatCurrencyInput(e.target.value) : formatPercentInput(e.target.value),
              })}
            />
            <b>{draft.commType === 'direct' ? '원' : '%'}</b>
          </span>
        </div>
      )}
    </>
  )
}
