// @ts-check
// 파렛트 회수 입력. fixedOn + 고정노선 연결 거래처의 palletOn이 켜져 있을 때만 보인다.
import { FixedAmountLine } from './FixedCountSection.jsx'

/** @typedef {import('./dayLogTypes.js').ClientLike} ClientLike */

/**
 * @param {Object} props
 * @param {boolean} props.visible
 * @param {number} props.palletCount
 * @param {boolean} props.isOff
 * @param {ClientLike|null} props.fixedRouteClient
 * @param {(count: number|string) => void} props.onChange
 */
export default function PalletSection({ visible, palletCount, isOff, fixedRouteClient, onChange }) {
  if (!visible) return null
  const value = !isOff && palletCount > 0 ? String(palletCount) : ''
  return (
    <div className="form-group fixed-route-group pallet-route-group">
      <div className="fixed-route-input-row">
        <label htmlFor="modalPalletCount">파렛트 회수</label>
        <div className="input-with-suffix">
          <input
            id="modalPalletCount"
            type="number"
            className="input-box"
            inputMode="numeric"
            min="0"
            placeholder="0"
            value={value}
            disabled={isOff}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="suffix">장</span>
        </div>
      </div>
      <FixedAmountLine label="파렛트 금액" count={palletCount} unit="장" price={fixedRouteClient?.palletPrice} isOff={isOff} />
    </div>
  )
}
