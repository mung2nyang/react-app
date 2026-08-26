// AppSettingsPage.jsx에서 분리 (200줄 제한, migration-audit-plan.md Step 2 부수 조치).
// "파일만 쪼개면 됨" 대상이라 로직은 그대로다.
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
