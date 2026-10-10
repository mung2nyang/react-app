// @ts-check
// 앱 설정의 켜기/끄기 줄 한 개.
/**
 * @param {Object} props
 * @param {string} props.id
 * @param {string} props.label
 * @param {boolean} props.checked
 * @param {boolean} [props.disabled]
 * @param {(checked: boolean) => void} props.onChange
 */
export default function SwitchRow({ id, label, checked, disabled, onChange }) {
  return (
    <div className="setting-item">
      <label htmlFor={id}>{label}</label>
      <label className="switch">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="slider"></span>
      </label>
    </div>
  )
}
