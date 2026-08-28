// @ts-check
// Step 6(일지 재작성): 바닐라의 #modalPalletSection을 그대로 옮긴다. fixedOn +
// 고정노선 연결 거래처의 palletOn이 켜져 있을 때만 보인다 — 이 react 포트는 아직
// 거래처 폼에 fixedRouteLinked/palletOn이 없어(Step 7 몫) 실제로는 항상 숨어
// 있지만, day record에는 이미 palletCount가 정확히 저장된다(day-record.js).
/**
 * @param {Object} props
 * @param {boolean} props.visible
 * @param {number} props.palletCount
 * @param {boolean} props.isOff
 * @param {(count: number|string) => void} props.onChange
 */
export default function PalletSection({ visible, palletCount, isOff, onChange }) {
  if (!visible) return null
  const value = !isOff && palletCount > 0 ? String(palletCount) : ''
  return (
    <div className="form-group fixed-route-group pallet-route-group">
      <label htmlFor="modalPalletCount">파렛트 회수</label>
      <div className="fixed-route-input-row">
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
        <span className="fixed-route-unit">장</span>
      </div>
    </div>
  )
}
