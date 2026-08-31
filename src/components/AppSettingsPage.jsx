import { useOwnerSettings } from '../store/ownerDataHooks.js'
import { applyTheme, savePracticeSettings } from '../lib/practiceSettings.js'
import { useHydrationLock } from '../app/useHydrationLock.js'
import SwitchRow from './SwitchRow.jsx'
import FixedRouteBlock from './FixedRouteBlock.jsx'

export default function AppSettingsPage({ ownerKey = 'guest', onBack, showToast }) {
  const locked = useHydrationLock()
  const settings = useOwnerSettings(ownerKey)

  function patch(nextPatch) {
    const next = savePracticeSettings(ownerKey, nextPatch)
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

      {locked && (
        <p id="settingsHydrationLockNotice" className="car-type-hint">
          클라우드 동기화 중입니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      <fieldset disabled={locked} style={{ border: 0, margin: 0, padding: 0 }}>
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
      </fieldset>
    </div>
  )
}
