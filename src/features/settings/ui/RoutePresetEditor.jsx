// @ts-check
// 앱 설정의 노선 이름표(프리셋) 편집.
import { useState } from 'react'
import { addFixedRoutePreset, checkRoutePreset, FIXED_ROUTE_PRESET_MAX, removeFixedRoutePreset } from '../../../domain/practiceSettings.js'
import FieldError, { focusField, invalidProps } from '../../../shared/ui/FieldError.jsx'

/** @typedef {import('../../../domain/financeTypes.js').FinanceSettings} FinanceSettings */

/**
 * @param {Object} props
 * @param {'main'|'sub'} props.scope
 * @param {FinanceSettings} props.settings
 * @param {(patch: Partial<FinanceSettings>) => void|Promise<void>} props.onPatch
 * @param {(message: string) => void} [props.showToast]
 */
export default function RoutePresetEditor({ scope, settings, onPatch, showToast }) {
  const [loadLoc, setLoadLoc] = useState('')
  const [unloadLoc, setUnloadLoc] = useState('')
  const key = scope === 'sub' ? 'subFixedRoutePresets' : 'fixedRoutePresets'
  const presets = settings[key] || []
  const ids = { loadLoc: `routePresetLoad-${scope}`, unloadLoc: `routePresetUnload-${scope}` }
  const [problem, setProblem] = useState(/** @type {ReturnType<typeof checkRoutePreset>} */ (null))
  // 문제 칸을 채우면 표시를 거둔다.
  const shown = problem && checkRoutePreset(loadLoc, unloadLoc)?.field === problem.field ? problem : null

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
    onPatch({ [key]: result.settings[key] })
    setLoadLoc('')
    setUnloadLoc('')
  }

  return (
    <div className="setting-item fixed-route-preset-setting">
      <div className="run-count-preset-copy">
        <label>자주 다니는 노선 등록</label>
        <p>부산→대구처럼 항상 같은 구간만 오간다면, 노선을 등록해 두고 일일운행에서 한 번 눌러 횟수를 기록하세요.</p>
      </div>
      <div className="fixed-route-preset-list">
        {presets.length === 0 && <div className="fixed-route-preset-empty">등록된 노선이 없습니다.</div>}
        {presets.map((route) => (
          <div key={route.id} className="fixed-route-preset-row">
            <span>{route.loadLoc} → {route.unloadLoc}</span>
            <button type="button" title="노선 삭제" aria-label={`${route.loadLoc} → ${route.unloadLoc} 삭제`} onClick={() => onPatch(removeFixedRoutePreset(settings, scope, route.id))}>×</button>
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
