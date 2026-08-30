// @ts-check
import { SETTLEMENT_MODES, getSettlementModeMeta } from '../../lib/cars.js'
import { formatPhoneNumber } from '../../lib/formatPhone.js'
import { formatCurrencyInput, formatPercentInput } from '../../lib/money.js'

/**
 * @typedef {Object} CarFormDraft
 * @property {string} number
 * @property {string} tonnage
 * @property {'main'|'sub'} type
 * @property {string} driverName
 * @property {string} driverPhone
 * @property {string} settlementMode
 * @property {boolean} commEnabled
 * @property {string} commType
 * @property {string} commission
 */

/**
 * @param {Object} props
 * @param {CarFormDraft} props.draft
 * @param {import('react').Dispatch<import('react').SetStateAction<CarFormDraft>>} props.setDraft
 * @param {string|null} props.editingId
 * @param {() => void} props.onCancel
 * @param {() => void} props.onSave
 */
export default function CarFormModal({ draft, setDraft, editingId, onCancel, onSave }) {
  const isSub = draft.type === 'sub'
  const settlementMeta = getSettlementModeMeta(draft.settlementMode)

  /** @param {'percent'|'direct'} nextType */
  function setCommType(nextType) {
    setDraft((prev) => ({
      ...prev,
      commType: nextType,
      commission: prev.commType === nextType ? prev.commission : '',
    }))
  }

  /** @param {string} value */
  function onCommissionChange(value) {
    setDraft((prev) => ({
      ...prev,
      commission: prev.commType === 'direct' ? formatCurrencyInput(value) : formatPercentInput(value),
    }))
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content car-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          {editingId ? (isSub ? '기사 정보 수정' : '차량 수정') : (isSub ? '기사 등록' : '차량 등록')}
        </div>
        <div className="form-group">
          <label htmlFor="newCarNumber">차량번호</label>
          <input id="newCarNumber" className="input-box" placeholder="12가 3456" value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="newCarTonnage">차량 톤수</label>
          <input id="newCarTonnage" className="input-box" placeholder="예: 5톤, 11톤, 25톤" value={draft.tonnage} onChange={(e) => setDraft({ ...draft, tonnage: e.target.value })} />
        </div>
        {isSub && (
          <>
            <div className="form-group">
              <label htmlFor="newDriverName">기사명</label>
              <input id="newDriverName" className="input-box" placeholder="기사명을 입력하세요" value={draft.driverName} onChange={(e) => setDraft({ ...draft, driverName: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="newUserPhone">연락처</label>
              <input id="newUserPhone" className="input-box" type="tel" placeholder="010-0000-0000" value={draft.driverPhone} onChange={(e) => setDraft({ ...draft, driverPhone: formatPhoneNumber(e.target.value) })} />
            </div>
            <div className="form-group">
              <label htmlFor="newCarSettlementMode">계산서 처리 방식</label>
              <select id="newCarSettlementMode" className="input-box" value={draft.settlementMode} onChange={(e) => {
                const next = e.target.value
                if (!SETTLEMENT_MODES.some((item) => item.value === next)) return
                setDraft({ ...draft, settlementMode: next })
              }}>
                {SETTLEMENT_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <p className="car-settlement-mode-guide">{settlementMeta.description}</p>
            </div>
            <div className="setting-item">
              <div className="car-option-copy">
                <label htmlFor="newCarCommToggle">기사(차량) 수수료 적용</label>
                <p>정산 시 이 차량(기사)에게서 공제할 수수료를 설정합니다.</p>
              </div>
              <label className="switch">
                <input id="newCarCommToggle" type="checkbox" checked={draft.commEnabled} onChange={(e) => setDraft({ ...draft, commEnabled: e.target.checked })} />
                <span className="slider"></span>
              </label>
            </div>
            {draft.commEnabled && (
              <div className="car-commission-panel">
                <div className="car-commission-heading">
                  <strong>기사(차량) 수수료 입력</strong>
                  <span>정산 시 설정한 방식으로 자동 계산됩니다.</span>
                </div>
                <div className="car-commission-type" role="group" aria-label="기사(차량) 수수료 입력 방식">
                  <button type="button" className={draft.commType === 'percent' ? 'active' : ''} aria-pressed={draft.commType === 'percent'} onClick={() => setCommType('percent')}>
                    <span>%</span> 비율
                  </button>
                  <button type="button" className={draft.commType === 'direct' ? 'active' : ''} aria-pressed={draft.commType === 'direct'} onClick={() => setCommType('direct')}>
                    <span>₩</span> 금액
                  </button>
                </div>
                <label className="car-commission-value" htmlFor="newCarCommission">
                  <span>{draft.commType === 'direct' ? '기사(차량) 건당 수수료' : '기사(차량) 수수료율'}</span>
                  <span className="car-commission-input">
                    <input id="newCarCommission" inputMode={draft.commType === 'direct' ? 'numeric' : 'decimal'} placeholder="0" value={draft.commission} onChange={(e) => onCommissionChange(e.target.value)} />
                    <b>{draft.commType === 'direct' ? '원' : '%'}</b>
                  </span>
                </label>
              </div>
            )}
          </>
        )}
        <p className="car-type-hint">{isSub ? '기사 차량으로 등록됩니다. (기사 연동은 나중에)' : '메인 차량으로 등록됩니다.'}</p>
        <div className="modal-btns">
          <button type="button" className="modal-btn cancel" onClick={onCancel}>취소</button>
          <button type="button" className="modal-btn confirm" onClick={onSave}>저장</button>
        </div>
      </div>
    </div>
  )
}
