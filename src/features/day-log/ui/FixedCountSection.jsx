// @ts-check
import { formatWon, parseCurrencyValue } from '../../../domain/money.js'

/** @typedef {import('./dayLogTypes.js').ClientLike} ClientLike */

// 금액은 저장하지 않고 달력과 같은 공식(횟수 × 거래처 단가, 수수료 전)으로 보여 주기만 한다.
/**
 * @param {Object} props
 * @param {string} props.label
 * @param {number} props.count
 * @param {string} props.unit
 * @param {string|number|undefined} props.price
 * @param {boolean} props.isOff
 */
export function FixedAmountLine({ label, count, unit, price, isOff }) {
  const unitPrice = Math.max(0, parseCurrencyValue(price))
  if (isOff || count <= 0 || unitPrice <= 0) return null
  return (
    <div className="fixed-route-amount">
      <span>{label}</span>
      <strong>{formatWon(count * unitPrice)}</strong>
      <span className="fixed-route-amount-formula">({count}{unit} × {formatWon(unitPrice)})</span>
    </div>
  )
}

/**
 * @param {Object} props
 * @param {number} props.count
 * @param {boolean} props.isOff
 * @param {Array<number>} props.quickCounts
 * @param {ClientLike|null} props.fixedRouteClient
 * @param {(count: number|string) => void} props.onChange
 */
export default function FixedCountSection({ count, isOff, quickCounts, fixedRouteClient, onChange }) {
  const value = !isOff && count > 0 ? String(count) : ''
  return (
    <>
      <div className="fixed-route-input-row">
        <label htmlFor="modalFixedCountInput">운행 횟수 입력</label>
        <div className="input-with-suffix">
          <input
            id="modalFixedCountInput"
            type="number"
            className="input-box"
            inputMode="numeric"
            min="0"
            placeholder="0"
            value={value}
            disabled={isOff}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="suffix">회</span>
        </div>
      </div>
      <FixedAmountLine label="고정 노선 금액" count={count} unit="회" price={fixedRouteClient?.fixedUnitPrice} isOff={isOff} />
      {quickCounts.length > 0 && (
        <div className="fixed-count-quick-buttons" aria-label="운행 횟수 빠른 선택">
          {quickCounts.map((n) => (
            <button
              key={n}
              type="button"
              className={`quick-count-btn${count === n && !isOff ? ' active' : ''}`}
              disabled={isOff}
              onClick={() => onChange(count === n && !isOff ? 0 : n)}
            >
              {n}회
            </button>
          ))}
        </div>
      )}
    </>
  )
}
