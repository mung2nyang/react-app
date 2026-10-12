// @ts-check
import { useParams } from 'react-router-dom'
import { useOwnerCars, useOwnerDrivers, useOwnerSettings } from '../store/ownerDataHooks.js'
import { applyTheme, savePracticeSettings } from '../lib/practiceSettings.js'
import { defaultCarSettings } from '../domain/practiceSettings.js'
import { resolveDriverOrPlateLabel } from '../domain/driverManagementContext.js'
import { useHydrationLock } from '../app/useHydrationLock.js'
import SwitchRow from './SwitchRow.jsx'
import FixedRouteBlock from './FixedRouteBlock.jsx'
import PageHeader from './PageHeader.jsx'
import AppSettingsBackupSection from './AppSettingsBackupSection.jsx'
import './app-settings.css'
import './app-settings-groups.css'

/** @typedef {import('../domain/financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('../domain/financeTypes.js').SubCarPracticeSettings} SubCarPracticeSettings */

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {import('../lib/outboxTypes.js').AppSession|null} [props.session]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function AppSettingsPage({ ownerKey = 'guest', session = null, onBack, showToast, onOpenMenu }) {
  const locked = useHydrationLock()
  const settings = useOwnerSettings(ownerKey)
  const { logId: rawLogId } = useParams()
  const logId = rawLogId ? decodeURIComponent(rawLogId) : ''
  const cars = useOwnerCars(ownerKey)
  const drivers = useOwnerDrivers(ownerKey)
  const carLabel = logId ? resolveDriverOrPlateLabel(logId, drivers, cars) : ''
  const carSettings = logId ? (settings.subCarSettings?.[logId] || defaultCarSettings()) : defaultCarSettings()
  const fixedOn = logId ? !!settings.subFixedOn : !!settings.fixedOn
  // 고정노선 거래처 스코프: 서브차량 = logId, 연동기사 본인 = 배정 차량(MainPageRoute와 같은 규칙), 차주 메인 = 없음.
  const clientScopeKey = logId || (session?.linkedOwnerId ? (cars[0]?.number || 'main') : '')

  /**
   * @param {Partial<FinanceSettings>} nextPatch
   */
  async function patch(nextPatch) {
    try {
      const next = await savePracticeSettings(ownerKey, nextPatch)
      applyTheme(next.theme)
    } catch (error) {
      console.error('설정 저장 실패:', error)
      showToast?.('저장에 실패했습니다. 네트워크 상태를 확인해 주세요.')
    }
  }

  /** @param {Partial<SubCarPracticeSettings>} nextPatch 차량별(logId) 전용 항목만 — 결제/고정노선은 patch() 그대로 */
  function patchActive(nextPatch) {
    if (!logId) return patch(nextPatch)
    const nextCar = { ...carSettings, ...nextPatch }
    return patch({ subCarSettings: { ...(settings.subCarSettings || {}), [logId]: nextCar } })
  }

  const isDark = settings.theme === 'dark'
  const activeSettings = logId ? carSettings : settings
  // 세부 입력 하위 항목은 토글 대신 칩(체크박스) — 토글이 줄지어 보이지 않게
  const detailChips = [
    ...(!logId ? [{ id: 'paymentToggle', label: '결제·수금', checked: !!settings.paymentOn, onChange: (/** @type {boolean} */ v) => patch({ paymentOn: v }) }] : []),
    { id: 'timeToggle', label: '운행 시간', checked: !!activeSettings.timeOn, onChange: (/** @type {boolean} */ v) => patchActive({ timeOn: v }) },
    { id: 'platformToggle', label: '플랫폼', checked: !!activeSettings.platformOn, onChange: (/** @type {boolean} */ v) => patchActive({ platformOn: v }) },
    { id: 'distanceToggle', label: '계기판', checked: !!activeSettings.distanceOn, onChange: (/** @type {boolean} */ v) => patchActive({ distanceOn: v }) },
    { id: 'cargoTonnageToggle', label: '화물 톤수', checked: !!activeSettings.cargoTonnageOn, onChange: (/** @type {boolean} */ v) => patchActive({ cargoTonnageOn: v }) },
  ]

  return (
    <div className="page app-settings-page">
      <PageHeader title={logId ? `${carLabel} 운행일지 설정` : '앱 설정'} onBack={onBack} onOpenMenu={onOpenMenu} />

      {locked && (
        <p id="settingsHydrationLockNotice" className="car-type-hint">
          서버에서 기록을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      <fieldset disabled={locked} style={{ border: 0, margin: 0, padding: 0 }}>
        <h3 className="settings-group-title">화면 표시</h3>
        <section className="setting-section settings-theme-card">
          {!logId && (
            <div className="setting-item settings-theme-row">
              <label htmlFor="theme-dark">다크 모드</label>
              <label className="switch">
                <input id="theme-dark" type="checkbox" checked={isDark} onChange={(e) => patch({ theme: e.target.checked ? 'dark' : 'light' })} />
                <span className="slider"></span>
              </label>
            </div>
          )}
          <div className="setting-item settings-calendar-row">
            <div className="settings-calendar-copy">
              <label>달력 일일 표시</label>
              <p className="settings-row-guide">
                달력에 하루 운행 횟수 또는 운송료를 표시합니다.
              </p>
              {activeSettings.inputMode === 'fare' && (
                <p className="settings-row-note">만 원 단위로 줄여 표시 (예: 115,500원 → 11.5만)</p>
              )}
            </div>
            <div className="segment-control">
              <button
                type="button"
                className={`segment-btn${activeSettings.inputMode === 'count' ? ' active' : ''}`}
                onClick={() => patchActive({ inputMode: 'count' })}
              >
                횟수
              </button>
              <button
                type="button"
                className={`segment-btn${activeSettings.inputMode === 'fare' ? ' active' : ''}`}
                onClick={() => patchActive({ inputMode: 'fare' })}
              >
                금액
              </button>
            </div>
          </div>
        </section>

        <h3 className="settings-group-title">운행일지 입력</h3>
        <section className="setting-section">
          {ownerKey !== 'guest' && (
            <div className="daily-inspection-switch">
              <SwitchRow id="dailyInspectionToggle" label="일상점검표 사용" checked={!!activeSettings.dailyInspectionOn} onChange={(checked) => patchActive({ dailyInspectionOn: checked })} />
            </div>
          )}
          <SwitchRow
            id="callDetailToggle"
            label="운행일지 세부 입력"
            checked={!!activeSettings.callDetail}
            disabled={!fixedOn}
            onChange={(checked) => patchActive({ callDetail: checked })}
          />
          {!fixedOn && (
            <p className="car-type-hint">고정 노선을 끄면 세부 입력이 필수로 켜집니다.</p>
          )}
          {activeSettings.callDetail && (
            <div className="tree-line-group">
              <p className="settings-chip-guide">입력할 항목을 고르세요</p>
              <div className="settings-chip-group" role="group" aria-label="세부 입력 항목">
                {detailChips.map((chip) => (
                  <label key={chip.id} className={`settings-chip${chip.checked ? ' on' : ''}`}>
                    <input id={chip.id} type="checkbox" checked={chip.checked} onChange={(e) => chip.onChange(e.target.checked)} />
                    {chip.label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </section>

        <h3 className="settings-group-title">고정 노선</h3>
        <section className="setting-section">
          <FixedRouteBlock scope={logId ? 'sub' : 'main'} ownerKey={ownerKey} clientScopeKey={clientScopeKey} settings={settings} onPatch={patch} showToast={showToast} />
        </section>

        {!logId && ownerKey === 'guest' && <AppSettingsBackupSection showToast={showToast} />}
      </fieldset>
    </div>
  )
}
