// AppSettingsPage.jsx에서 분리 (200줄 제한, migration-audit-plan.md Step 2 부수 조치).
import { useState } from 'react'
import { addFixedRoutePreset, FIXED_ROUTE_PRESET_MAX, removeFixedRoutePreset } from '../lib/practiceSettings.js'

export default function RoutePresetEditor({ scope, settings, onPatch, showToast }) {
  const [loadLoc, setLoadLoc] = useState('')
  const [unloadLoc, setUnloadLoc] = useState('')
  const key = scope === 'sub' ? 'subFixedRoutePresets' : 'fixedRoutePresets'
  const presets = settings[key] || []

  function addRoute() {
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
        <p>부산→대구처럼 항상 같은 구간만 오간다면, 노선을 등록해 두고 일일운행에서 원탭으로 횟수를 기록하세요.</p>
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
        <input className="input-box" placeholder="상차지" value={loadLoc} onChange={(e) => setLoadLoc(e.target.value)} />
        <span className="fixed-route-preset-arrow">→</span>
        <input className="input-box" placeholder="하차지" value={unloadLoc} onChange={(e) => setUnloadLoc(e.target.value)} />
        <button type="button" disabled={presets.length >= FIXED_ROUTE_PRESET_MAX} onClick={addRoute}>추가</button>
      </div>
    </div>
  )
}
