// @ts-check
import { useParams } from 'react-router-dom'
import { useOwnerCars, useOwnerDrivers, useOwnerSettings } from '../../../data/store/ownerDataHooks.ts'
import { applyTheme, savePracticeSettings } from '../../../data/sync/settingsSave.ts'
import { defaultCarSettings } from '../../../domain/practiceSettings.ts'
import { resolveDriverOrPlateLabel } from '../../../domain/driverManagementContext.ts'
import { useHydrationLock } from '../../../data/store/useHydrationLock.ts'
import SwitchRow from '../../../shared/ui/SwitchRow.tsx'
import FixedRouteBlock from './FixedRouteBlock.jsx'
import PageHeader from '../../../shared/ui/PageHeader.jsx'
import AppSettingsBackupSection from './AppSettingsBackupSection.jsx'
import './app-settings.css'
import './app-settings-groups.css'
import { SERVER_SAVE_FAIL } from '../../../shared/utils/failureMessages.js'
import { useToast } from '../../../shared/hooks/useToast.js'
import { useSession } from '../../../data/cloud/sessionContext.ts'

/** @typedef {import('../../../domain/financeTypes.ts').FinanceSettings} FinanceSettings */
/** @typedef {import('../../../domain/financeTypes.ts').SubCarPracticeSettings} SubCarPracticeSettings */

/**
 * @param {Object} props
 * @param {() => void} [props.onBack]
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function AppSettingsPage({ onBack, onOpenMenu }) {
  const { ownerKey, session } = useSession()
  const showToast = useToast()
  const locked = useHydrationLock()
  const settings = useOwnerSettings(ownerKey)
  const { logId: rawLogId } = useParams()
  const logId = rawLogId ? decodeURIComponent(rawLogId) : ''
  const cars = useOwnerCars(ownerKey)
  const drivers = useOwnerDrivers(ownerKey)
  const carLabel = logId ? resolveDriverOrPlateLabel(logId, drivers, cars) : ''
  const fixedOn = logId ? !!settings.subFixedOn : !!settings.fixedOn
  const carSettings = logId ? (settings.subCarSettings?.[logId] || defaultCarSettings(fixedOn)) : defaultCarSettings()
  // 고정노선 거래처 스코프: 서브차량 = logId, 연동기사 본인 = 배정 차량(MainPageRoute와 같은 규칙), 차주 메인 = 없음.
  const clientScopeKey = logId || (session?.linkedOwnerId ? (cars[0]?.number || 'main') : '')

  /**
   * @param {import('../../../data/sync/settingsSave.ts').SettingsPatch} nextPatch
   */
  async function patch(nextPatch) {
    try {
      const next = await savePracticeSettings(ownerKey, nextPatch)
      applyTheme(next.theme)
    } catch (error) {
      console.error('설정 저장 실패:', error)
      showToast?.(SERVER_SAVE_FAIL)
    }
  }

  /** @param {Partial<SubCarPracticeSettings>} nextPatch 차량별(logId) 전용 항목만 — 결제/고정노선은 patch() 그대로 */
  function patchActive(nextPatch) {
    if (!logId) return patch(nextPatch)
    return patch((current) => ({
      subCarSettings: { ...(current.subCarSettings || {}), [logId]: { ...(current.subCarSettings?.[logId] || defaultCarSettings(current.subFixedOn ?? true)), ...nextPatch } },
    }))
  }

  const isDark = settings.theme === 'dark'
  const activeSettings = logId ? carSettings : settings
  // 세부 입력 하위 항목은 토글 대신 칩(체크박스) — 토글이 줄지어 보이지 않게
  const detailChipRows = [
    [
      { id: 'timeToggle', label: '운행 시간', checked: !!activeSettings.timeOn, onChange: (/** @type {boolean} */ v) => patchActive({ timeOn: v }) },
      { id: 'distanceToggle', label: '계기판', checked: !!activeSettings.distanceOn, onChange: (/** @type {boolean} */ v) => patchActive({ distanceOn: v }) },
      { id: 'cargoTonnageToggle', label: '화물 톤수', checked: !!activeSettings.cargoTonnageOn, onChange: (/** @type {boolean} */ v) => patchActive({ cargoTonnageOn: v }) },
    ],
    [
      { id: 'platformToggle', label: '플랫폼', checked: !!activeSettings.platformOn, onChange: (/** @type {boolean} */ v) => patchActive({ platformOn: v }) },
      ...(!logId ? [{ id: 'paymentToggle', label: '결제/수금', checked: !!settings.paymentOn, onChange: (/** @type {boolean} */ v) => patch({ paymentOn: v }) }] : []),
    ],
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
          {!logId && ownerKey !== 'guest' && (
            <div className="setting-item settings-theme-row">
              <label htmlFor="unbiseoDockToggle">운비서 버튼</label>
              <label className="switch">
                <input id="unbiseoDockToggle" type="checkbox" checked={settings.unbiseoDockOn !== false} onChange={(e) => patch({ unbiseoDockOn: e.target.checked })} />
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
            <p className="car-type-hint">고정 노선을 끄면 세부 입력이 자동으로 필수 설정됩니다.</p>
          )}
          {activeSettings.callDetail && (
            <div className="tree-line-group">
              <p className="settings-chip-guide">입력할 항목을 고르세요</p>
              <div className="settings-chip-group" role="group" aria-label="세부 입력 항목">
                {detailChipRows.map((row, i) => (
                  <div key={i} className="settings-chip-row">
                    {row.map((chip) => (
                      <label key={chip.id} className={`settings-chip${chip.checked ? ' on' : ''}`}>
                        <input id={chip.id} type="checkbox" checked={chip.checked} onChange={(e) => chip.onChange(e.target.checked)} />
                        {chip.label}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <h3 className="settings-group-title">고정 노선</h3>
        <section className="setting-section">
          <FixedRouteBlock scope={logId ? 'sub' : 'main'} clientScopeKey={clientScopeKey} settings={settings} onPatch={patch} />
        </section>

        {!logId && ownerKey === 'guest' && <AppSettingsBackupSection />}
      </fieldset>
    </div>
  )
}
