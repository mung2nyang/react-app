// AppSettingsPage.jsx에서 분리 (200줄 제한, migration-audit-plan.md Step 2 부수 조치).
import SwitchRow from './SwitchRow.jsx'
import RoutePresetEditor from './RoutePresetEditor.jsx'
import RunCountChips from './RunCountChips.jsx'

export default function FixedRouteBlock({ scope, settings, onPatch, showToast }) {
  const isSub = scope === 'sub'
  const fixedOn = isSub ? settings.subFixedOn : settings.fixedOn
  const routeOn = isSub ? settings.subFixedRouteOn : settings.fixedRouteOn
  const runOn = isSub ? settings.subRunCountToggle : settings.runCountToggle

  return (
    <>
      <SwitchRow
        id={isSub ? 'subFixedToggle' : 'fixedToggle'}
        label="고정 노선 사용"
        checked={fixedOn}
        onChange={(checked) => onPatch(isSub ? { subFixedOn: checked } : { fixedOn: checked })}
      />
      {fixedOn && (
        <div className="tree-line-group">
          <SwitchRow
            id={isSub ? 'subFixedRouteToggle' : 'fixedRouteToggle'}
            label="상하차지 사용"
            checked={routeOn}
            onChange={(checked) => onPatch(isSub ? { subFixedRouteOn: checked } : { fixedRouteOn: checked })}
          />
          {routeOn && <RoutePresetEditor scope={scope} settings={settings} onPatch={onPatch} showToast={showToast} />}
          <SwitchRow
            id={isSub ? 'subRunCountToggle' : 'runCountToggle'}
            label="운행 횟수 버튼 사용"
            checked={runOn}
            onChange={(checked) => onPatch(isSub ? { subRunCountToggle: checked } : { runCountToggle: checked })}
          />
          {runOn && <RunCountChips scope={scope} settings={settings} onPatch={onPatch} showToast={showToast} />}
        </div>
      )}
    </>
  )
}
