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

/** @typedef {import('../domain/financeTypes.js').FinanceSettings} FinanceSettings */
/** @typedef {import('../domain/financeTypes.js').SubCarPracticeSettings} SubCarPracticeSettings */

const SUN_ICON = (
  <svg className="inline-icon sm" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="5"></circle>
    <line x1="12" y1="1" x2="12" y2="3"></line>
    <line x1="12" y1="21" x2="12" y2="23"></line>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
    <line x1="1" y1="12" x2="3" y2="12"></line>
    <line x1="21" y1="12" x2="23" y2="12"></line>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
  </svg>
)

const MOON_ICON = (
  <svg className="inline-icon sm" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
  </svg>
)

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function AppSettingsPage({ ownerKey = 'guest', onBack, showToast, onOpenMenu }) {
  const locked = useHydrationLock()
  const settings = useOwnerSettings(ownerKey)
  const { logId: rawLogId } = useParams()
  const logId = rawLogId ? decodeURIComponent(rawLogId) : ''
  const cars = useOwnerCars(ownerKey)
  const drivers = useOwnerDrivers(ownerKey)
  const carLabel = logId ? resolveDriverOrPlateLabel(logId, drivers, cars) : ''
  const carSettings = logId ? (settings.subCarSettings?.[logId] || defaultCarSettings()) : defaultCarSettings()
  const fixedOn = logId ? !!settings.subFixedOn : !!settings.fixedOn

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

  return (
    <div className="page app-settings-page">
      <PageHeader title={logId ? `${carLabel} 운행일지 설정` : '앱 설정'} onBack={onBack} onOpenMenu={onOpenMenu} />

      {locked && (
        <p id="settingsHydrationLockNotice" className="car-type-hint">
          클라우드 동기화 중입니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      <fieldset disabled={locked} style={{ border: 0, margin: 0, padding: 0 }}>
        {!logId && (
          <section className="setting-section settings-theme-card">
            <div className="setting-item">
              <label>테마 선택</label>
              <button
                type="button"
                className="theme-toggle-btn"
                onClick={() => patch({ theme: isDark ? 'light' : 'dark' })}
              >
                {isDark ? MOON_ICON : SUN_ICON}
                <span>{isDark ? '다크 모드' : '라이트 모드'}</span>
              </button>
            </div>
          </section>
        )}

        <section className="setting-section">
          <h3>운행 일지 설정</h3>
          <div className="setting-item">
            <label>달력 일일 표시 방식</label>
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

        <section className="setting-section">
          <SwitchRow
            id="callDetailToggle"
            label="운행 일지 세부 입력"
            checked={!!activeSettings.callDetail}
            disabled={!fixedOn}
            onChange={(checked) => patchActive({ callDetail: checked })}
          />
          {!fixedOn && (
            <p className="car-type-hint">고정 노선을 끄면 세부 입력이 필수로 켜집니다.</p>
          )}
          {activeSettings.callDetail && (
            <div className="tree-line-group">
              {!logId && (
                <SwitchRow id="paymentToggle" label="결제 및 수금 입력" checked={!!settings.paymentOn} onChange={(checked) => patch({ paymentOn: checked })} />
              )}
              <SwitchRow id="timeToggle" label="운행 시간 입력" checked={!!activeSettings.timeOn} onChange={(checked) => patchActive({ timeOn: checked })} />
              <SwitchRow id="platformToggle" label="플랫폼 입력" checked={!!activeSettings.platformOn} onChange={(checked) => patchActive({ platformOn: checked })} />
              <SwitchRow id="distanceToggle" label="계기판 입력" checked={!!activeSettings.distanceOn} onChange={(checked) => patchActive({ distanceOn: checked })} />
              <SwitchRow id="cargoTonnageToggle" label="화물 톤수 입력" checked={!!activeSettings.cargoTonnageOn} onChange={(checked) => patchActive({ cargoTonnageOn: checked })} />
            </div>
          )}
        </section>

        <section className="setting-section">
          <FixedRouteBlock scope={logId ? 'sub' : 'main'} settings={settings} onPatch={patch} showToast={showToast} />
        </section>

        {!logId && ownerKey === 'guest' && <AppSettingsBackupSection showToast={showToast} />}
      </fieldset>
    </div>
  )
}
