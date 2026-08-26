import { useState } from 'react'
import {
  addFixedRoutePreset,
  addRunCountPreset,
  applyTheme,
  FIXED_ROUTE_PRESET_MAX,
  loadPracticeSettings,
  removeFixedRoutePreset,
  removeRunCountPreset,
  replaceRunCountPreset,
  RUN_COUNT_PRESET_MAX,
  savePracticeSettings,
} from '../lib/practiceSettings.js'

function SwitchRow({ id, label, checked, disabled, onChange }) {
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

function RoutePresetEditor({ scope, settings, onPatch, showToast }) {
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

function RunCountChips({ scope, settings, onPatch, showToast }) {
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

function FixedRouteBlock({ scope, settings, onPatch, showToast }) {
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

export default function AppSettingsPage({ ownerKey = 'guest', onBack, showToast }) {
  const [settings, setSettings] = useState(() => loadPracticeSettings(ownerKey))

  function patch(nextPatch) {
    const next = savePracticeSettings(ownerKey, nextPatch)
    setSettings(next)
    applyTheme(next.theme)
  }

  return (
    <div className="page app-settings-page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">앱 설정</div>
        <div style={{ width: 40 }}></div>
      </div>

      <section className="setting-section settings-theme-card">
        <div className="setting-item">
          <label>테마 선택</label>
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={() => patch({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
          >
            {settings.theme === 'dark' ? '다크 모드' : '라이트 모드'}
          </button>
        </div>
      </section>

      <section className="setting-section">
        <h3>운행 일지 설정</h3>
        <div className="setting-item">
          <label>달력 일일 표시 방식</label>
          <div className="settings-segmented-control">
            <button
              type="button"
              className={`toggle-btn${settings.inputMode === 'count' ? ' active-work' : ''}`}
              onClick={() => patch({ inputMode: 'count' })}
            >
              횟수
            </button>
            <button
              type="button"
              className={`toggle-btn${settings.inputMode === 'fare' ? ' active-work' : ''}`}
              onClick={() => patch({ inputMode: 'fare' })}
            >
              금액
            </button>
          </div>
        </div>
        <p className="car-type-hint">금액 표시는 달력에 나중에 붙입니다. 지금은 저장만 됩니다.</p>
      </section>

      <section className="setting-section">
        <SwitchRow
          id="callDetailToggle"
          label="운행 일지 세부 입력"
          checked={settings.callDetail}
          disabled={!settings.fixedOn}
          onChange={(checked) => patch({ callDetail: checked })}
        />
        {!settings.fixedOn && (
          <p className="car-type-hint">고정 노선을 끄면 세부 입력이 필수로 켜집니다.</p>
        )}
        {settings.callDetail && (
          <div className="tree-line-group">
            <SwitchRow id="paymentToggle" label="결제 및 수금 입력" checked={settings.paymentOn} onChange={(checked) => patch({ paymentOn: checked })} />
            <SwitchRow id="timeToggle" label="운행 시간 입력" checked={settings.timeOn} onChange={(checked) => patch({ timeOn: checked })} />
            <SwitchRow id="platformToggle" label="플랫폼 입력" checked={settings.platformOn} onChange={(checked) => patch({ platformOn: checked })} />
            <SwitchRow id="distanceToggle" label="계기판 입력" checked={settings.distanceOn} onChange={(checked) => patch({ distanceOn: checked })} />
            <SwitchRow id="cargoTonnageToggle" label="화물 톤수 입력" checked={settings.cargoTonnageOn} onChange={(checked) => patch({ cargoTonnageOn: checked })} />
          </div>
        )}
      </section>

      <section className="setting-section">
        <FixedRouteBlock scope="main" settings={settings} onPatch={patch} showToast={showToast} />
      </section>

      <section className="setting-section">
        <h3>기사차량 운행 일지 설정</h3>
        <FixedRouteBlock scope="sub" settings={settings} onPatch={patch} showToast={showToast} />
      </section>
    </div>
  )
}
