// @ts-check
import { formatCurrencyInput, formatPercentInput } from '../../lib/money.js'

/**
 * @param {Object} props
 * @param {import('../../domain/clientTypes.js').ClientDraft} props.draft
 * @param {import('react').Dispatch<import('react').SetStateAction<import('../../domain/clientTypes.js').ClientDraft>>} props.setDraft
 */
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
          <label htmlFor="clientFixedRouteToggle">고정노선 연동</label>
          <p>계정에서 한 곳만 연결할 수 있습니다. 다른 거래처는 저장 시 자동으로 해제됩니다.</p>
        </div>
        <label className="switch">
          <input
            id="clientFixedRouteToggle"
            type="checkbox"
            checked={!!draft.fixedRouteLinked}
            onChange={(e) => setDraft({ ...draft, fixedRouteLinked: e.target.checked })}
          />
          <span className="slider"></span>
        </label>
      </div>
      {draft.fixedRouteLinked && (
        <div className="form-group">
          <label htmlFor="clientFixedUnitPrice">고정노선 1회 단가</label>
          <input
            id="clientFixedUnitPrice"
            className="input-box"
            inputMode="numeric"
            placeholder="0"
            value={String(draft.fixedUnitPrice || '')}
            onChange={(e) => setDraft({ ...draft, fixedUnitPrice: formatCurrencyInput(e.target.value) })}
          />
        </div>
      )}
      <div className="setting-item">
        <div className="car-option-copy">
          <label htmlFor="clientPalletToggle">파렛트 단가</label>
        </div>
        <label className="switch">
          <input
            id="clientPalletToggle"
            type="checkbox"
            checked={!!draft.palletOn}
            onChange={(e) => setDraft({ ...draft, palletOn: e.target.checked })}
          />
          <span className="slider"></span>
        </label>
      </div>
      {draft.palletOn && (
        <div className="form-group">
          <label htmlFor="clientPalletPrice">파렛트 단가</label>
          <input
            id="clientPalletPrice"
            className="input-box"
            inputMode="numeric"
            placeholder="0"
            value={String(draft.palletPrice || '')}
            onChange={(e) => setDraft({ ...draft, palletPrice: formatCurrencyInput(e.target.value) })}
          />
        </div>
      )}
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
        <div className="car-commission-panel">
          <div className="car-commission-type" role="group" aria-label="수수료 입력 방식">
            <button type="button" className={draft.commType === 'percent' ? 'active' : ''} aria-pressed={draft.commType === 'percent'} onClick={() => setCommType('percent')}>
              <span>%</span> 비율
            </button>
            <button type="button" className={draft.commType === 'direct' ? 'active' : ''} aria-pressed={draft.commType === 'direct'} onClick={() => setCommType('direct')}>
              <span>₩</span> 금액
            </button>
          </div>
          <label className="car-commission-value" htmlFor="clientCommValue">
            <span>{draft.commType === 'direct' ? '건당 수수료' : '수수료율'}</span>
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
          </label>
        </div>
      )}
    </>
  )
}
