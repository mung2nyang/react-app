// @ts-check
/**
 * @param {Object} props
 * @param {boolean} props.isOff
 * @param {(off: boolean) => void} props.onChange
 */
export default function OffToggle({ isOff, onChange }) {
  return (
    <div className="btn-group-toggle">
      <button
        type="button"
        className={`toggle-btn${isOff ? ' active-off' : ''}`}
        onClick={() => onChange(!isOff)}
      >
        휴무
      </button>
    </div>
  )
}
