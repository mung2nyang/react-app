// @ts-check
/**
 * @param {Object} props
 * @param {number} props.count
 * @param {boolean} props.isOff
 * @param {Array<number>} props.quickCounts
 * @param {(count: number|string) => void} props.onChange
 */
export default function FixedCountSection({ count, isOff, quickCounts, onChange }) {
  const value = !isOff && count > 0 ? String(count) : ''
  return (
    <>
      <label htmlFor="modalFixedCountInput">운행 횟수 입력</label>
      <div className="fixed-route-input-row">
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
        <span className="fixed-route-unit">회 운행</span>
      </div>
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
