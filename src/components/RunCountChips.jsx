// AppSettingsPage.jsx에서 분리 (200줄 제한, migration-audit-plan.md Step 2 부수 조치).
import { addRunCountPreset, removeRunCountPreset, replaceRunCountPreset, RUN_COUNT_PRESET_MAX } from '../lib/practiceSettings.js'

export default function RunCountChips({ scope, settings, onPatch, showToast }) {
  const key = scope === 'sub' ? 'subRunCountPresets' : 'runCountPresets'
  const presets = settings[key] || []

  function addChip() {
    const result = addRunCountPreset(settings, scope)
    if (result.error) {
      showToast?.(result.error)
      return
    }
    onPatch({ [key]: result.settings[key] })
  }

  return (
    <div className="setting-item run-count-preset-setting">
      <div className="run-count-preset-copy">
        <label>횟수 버튼 설정</label>
        <p>각 버튼은 운행일지의 고정노선 횟수 버튼과 순서대로 연동됩니다. "+"로 버튼을 더 추가할 수 있습니다.</p>
      </div>
      <div className="run-count-preset-chips" aria-label={scope === 'sub' ? '기사차량 고정노선 횟수 버튼 설정' : '고정노선 횟수 버튼 설정'}>
        {presets.map((count, index) => (
          <span key={`${count}-${index}`} className="run-count-preset-chip-wrap">
            <input
              type="number"
              className="run-count-preset-chip"
              inputMode="numeric"
              min="1"
              defaultValue={count}
              aria-label={`${index + 1}번째 횟수 버튼`}
              onBlur={(e) => onPatch(replaceRunCountPreset(settings, scope, index, e.target.value))}
            />
            {presets.length > 1 && (
              <button type="button" className="run-count-preset-chip-remove" title="이 버튼 삭제" aria-label={`${count}회 버튼 삭제`} onClick={() => onPatch(removeRunCountPreset(settings, scope, index))}>×</button>
            )}
          </span>
        ))}
        {presets.length < RUN_COUNT_PRESET_MAX && (
          <span className="run-count-preset-chip-wrap">
            <button type="button" className="run-count-preset-add-chip" aria-label="횟수 버튼 추가" onClick={addChip}>+</button>
          </span>
        )}
      </div>
    </div>
  )
}
