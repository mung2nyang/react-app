// 앱 설정의 켜기/끄기 줄 한 개.
type SwitchRowProps = {
  id: string
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

export default function SwitchRow({ id, label, checked, disabled, onChange }: SwitchRowProps) {
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
