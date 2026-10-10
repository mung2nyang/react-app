// @ts-check
// 앱 설정의 고정노선 묶음.
import SwitchRow from './SwitchRow.jsx'
import RoutePresetEditor from './RoutePresetEditor.jsx'
import RunCountChips from './RunCountChips.jsx'
import FixedRouteClientLink from './FixedRouteClientLink.jsx'

/** @typedef {import('../domain/financeTypes.js').FinanceSettings} FinanceSettings */

/**
 * @param {Object} props
 * @param {'main'|'sub'} props.scope
 * @param {string} props.ownerKey
 * @param {string} props.clientScopeKey 고정노선 거래처 스코프(docs/sot.md §4-4e)
 * @param {FinanceSettings} props.settings
 * @param {(patch: Partial<FinanceSettings>) => void|Promise<void>} props.onPatch
 * @param {(message: string) => void} [props.showToast]
 */
export default function FixedRouteBlock({ scope, ownerKey, clientScopeKey, settings, onPatch, showToast }) {
  const isSub = scope === 'sub'
  const fixedOn = isSub ? settings.subFixedOn : settings.fixedOn
  const routeOn = isSub ? settings.subFixedRouteOn : settings.fixedRouteOn
  const runOn = isSub ? settings.subRunCountToggle : settings.runCountToggle

  return (
    <>
      <SwitchRow
        id={isSub ? 'subFixedToggle' : 'fixedToggle'}
        label="고정 노선 사용"
        checked={!!fixedOn}
        onChange={(checked) => onPatch(isSub ? { subFixedOn: checked } : { fixedOn: checked })}
      />
      {fixedOn && (
        <div className="tree-line-group">
          <FixedRouteClientLink ownerKey={ownerKey} scopeKey={clientScopeKey} showToast={showToast} />
          <SwitchRow
            id={isSub ? 'subFixedRouteToggle' : 'fixedRouteToggle'}
            label="상하차지 사용"
            checked={!!routeOn}
            onChange={(checked) => onPatch(isSub ? { subFixedRouteOn: checked } : { fixedRouteOn: checked })}
          />
          {routeOn && <RoutePresetEditor scope={scope} settings={settings} onPatch={onPatch} showToast={showToast} />}
          <SwitchRow
            id={isSub ? 'subRunCountToggle' : 'runCountToggle'}
            label="운행 횟수 버튼 사용"
            checked={!!runOn}
            onChange={(checked) => onPatch(isSub ? { subRunCountToggle: checked } : { runCountToggle: checked })}
          />
          {runOn && <RunCountChips scope={scope} settings={settings} onPatch={onPatch} showToast={showToast} />}
        </div>
      )}
    </>
  )
}
