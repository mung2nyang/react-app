// @ts-check
// 앱 설정의 노선 이름표(프리셋) 편집.
import { useState } from 'react'
import { addFixedRoutePreset, checkRoutePreset, FIXED_ROUTE_PRESET_MAX, removeFixedRoutePreset } from '../../../domain/practiceSettings.ts'
import FieldError, { focusField, invalidProps } from '../../../shared/ui/FieldError.jsx'
import { useToast } from '../../../shared/hooks/useToast.js'

/** @typedef {import('../../../domain/financeTypes.ts').FinanceSettings} FinanceSettings */

/**
 * @param {Object} props
 * @param {'main'|'sub'} props.scope
 * @param {FinanceSettings} props.settings
 * @param {(patch: import('../../../data/sync/settingsSave.ts').SettingsPatch) => void|Promise<void>} props.onPatch
 */
export default function RoutePresetEditor({ scope, settings, onPatch }) {
  const showToast = useToast()
  const [loadLoc, setLoadLoc] = useState('')
  const [unloadLoc, setUnloadLoc] = useState('')
  const key = scope === 'sub' ? 'subFixedRoutePresets' : 'fixedRoutePresets'
  const presets = settings[key] || []
  const ids = { loadLoc: `routePresetLoad-${scope}`, unloadLoc: `routePresetUnload-${scope}` }
  const [problem, setProblem] = useState(/** @type {ReturnType<typeof checkRoutePreset>} */ (null))
  // 문제 칸을 채우면 표시를 거둔다.
  const shown = problem && checkRoutePreset(loadLoc, unloadLoc)?.field === problem.field ? problem : null

  // 저장 차례가 왔을 때의 최신 설정에서 노선 목록만 바꾼다.
  /** @param {(current: FinanceSettings) => FinanceSettings} change */
  function patchPresets(change) {
    onPatch((current) => ({ [key]: change(current)[key] }))
  }

  function addRoute() {
    const found = checkRoutePreset(loadLoc, unloadLoc)
    setProblem(found)
    if (found) {
      focusField(ids[found.field])
      return
    }
    const result = addFixedRoutePreset(settings, scope, loadLoc, unloadLoc)
    if (result.error) {
      showToast?.(result.error)
      return
    }
    patchPresets((current) => addFixedRoutePreset(current, scope, loadLoc, unloadLoc).settings)
    setLoadLoc('')
    setUnloadLoc('')
  }

  return (
    <div className="setting-item fixed-route-preset-setting">
      <div className="run-count-preset-copy">
        <label>자주 다니는 노선 등록</label>
        <p>부산→대구처럼 같은 구간을 자주 운행한다면 노선으로 등록해 두세요. 운행일지에서 해당 노선을 누르면 운행 횟수가 기록됩니다.</p>
      </div>
      <div className="fixed-route-preset-list">
        {presets.length === 0 && <div className="fixed-route-preset-empty">등록된 노선이 없습니다.</div>}
        {presets.map((route) => (
          <div key={route.id} className="fixed-route-preset-row">
            <span>{route.loadLoc} → {route.unloadLoc}</span>
            <button type="button" title="노선 삭제" aria-label={`${route.loadLoc} → ${route.unloadLoc} 노선 삭제`} onClick={() => patchPresets((current) => removeFixedRoutePreset(current, scope, route.id))}>×</button>
          </div>
        ))}
      </div>
      <div className="fixed-route-preset-add-row">
        <input id={ids.loadLoc} className="input-box" placeholder="상차지" value={loadLoc} onChange={(e) => setLoadLoc(e.target.value)} {...invalidProps(shown, 'loadLoc', ids.loadLoc)} />
        <span className="fixed-route-preset-arrow">→</span>
        <input id={ids.unloadLoc} className="input-box" placeholder="하차지" value={unloadLoc} onChange={(e) => setUnloadLoc(e.target.value)} {...invalidProps(shown, 'unloadLoc', ids.unloadLoc)} />
        <button type="button" disabled={presets.length >= FIXED_ROUTE_PRESET_MAX} onClick={addRoute}>추가</button>
      </div>
      <FieldError problem={shown} field="loadLoc" inputId={ids.loadLoc} />
      <FieldError problem={shown} field="unloadLoc" inputId={ids.unloadLoc} />
    </div>
  )
}
