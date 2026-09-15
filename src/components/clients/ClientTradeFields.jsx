// @ts-check
import { formatCurrencyInput, formatPercentInput } from '../../lib/money.js'

/**
 * @param {Object} props
 * @param {import('../../domain/clientTypes.js').ClientDraft} props.draft
 * @param {import('react').Dispatch<import('react').SetStateAction<import('../../domain/clientTypes.js').ClientDraft>>} props.setDraft
 * @param {boolean} [props.hideFixedRoute]
 */
export default function ClientTradeFields({ draft, setDraft, hideFixedRoute = false }) {
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
      {!hideFixedRoute && (
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
        </>
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
        <div className="commission-settings-panel">
          <div className="commission-inline-row">
            <button type="button" className={`toggle-btn${draft.commType === 'percent' ? ' active-work' : ''}`} onClick={() => setCommType('percent')}>퍼센트 (%)</button>
            <button type="button" className={`toggle-btn${draft.commType === 'direct' ? ' active-work' : ''}`} onClick={() => setCommType('direct')}>금액 (원)</button>
            <input
              id="clientCommValue"
              className="input-box"
              inputMode={draft.commType === 'direct' ? 'numeric' : 'decimal'}
              placeholder={draft.commType === 'direct' ? '금액(원) 입력' : '비율(%) 입력'}
              value={String(draft.commValue || '')}
              onChange={(e) => setDraft({
                ...draft,
                commValue: draft.commType === 'direct' ? formatCurrencyInput(e.target.value) : formatPercentInput(e.target.value),
              })}
            />
          </div>
        </div>
      )}
    </>
  )
}
