import { useRef } from 'react'
import { useOwnerSettings } from '../store/ownerDataHooks.js'
import { applyTheme, savePracticeSettings } from '../lib/practiceSettings.js'
import { useHydrationLock } from '../app/useHydrationLock.js'
import { applyGuestBackupData, buildGuestBackupData, markBackupDone } from '../lib/guestBackup.js'
import SwitchRow from './SwitchRow.jsx'
import FixedRouteBlock from './FixedRouteBlock.jsx'

export default function AppSettingsPage({ ownerKey = 'guest', onBack, showToast }) {
  const locked = useHydrationLock()
  const settings = useOwnerSettings(ownerKey)
  const fileInputRef = useRef(null)

  async function patch(nextPatch) {
    try {
      const next = await savePracticeSettings(ownerKey, nextPatch)
      applyTheme(next.theme)
    } catch (error) {
      console.error('설정 저장 실패:', error)
      showToast?.('저장에 실패했습니다. 네트워크 상태를 확인해 주세요.')
    }
  }

  function handleExport() {
    try {
      const data = buildGuestBackupData()
      markBackupDone()
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
      if (typeof URL.createObjectURL === 'function') {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const todayStr = new Date().toISOString().slice(0, 10)
        a.href = url
        a.download = `운송내역_백업_${todayStr}.json`
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      showToast?.('백업 파일을 저장했습니다.')
    } catch (error) {
      console.error('백업 내보내기 실패:', error)
      showToast?.('백업 파일 생성에 실패했습니다.')
    }
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      let parsed
      try {
        parsed = JSON.parse(text.replace(/^\uFEFF/, ''))
      } catch {
        showToast?.('파일 내용이 손상되었거나 JSON 파일이 아닙니다.')
        return
      }
      const res = applyGuestBackupData(parsed)
      if (!res.ok) {
        showToast?.(res.error || '백업 데이터를 복원하지 못했습니다.')
        return
      }
      showToast?.('백업 데이터를 복원했습니다.')
    } catch (err) {
      console.error('백업 불러오기 실패:', err)
      showToast?.('백업 파일을 읽지 못했습니다.')
    } finally {
      e.target.value = ''
    }
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
        {ownerKey === 'guest' && (
          <section className="setting-section">
            <h3>데이터 백업</h3>
            <p className="car-type-hint" style={{ marginTop: 4, marginBottom: 12 }}>
              기기에 저장된 운행 기록과 설정을 파일로 백업하거나 복원합니다.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="theme-toggle-btn" onClick={handleExport}>백업 파일 다운로드</button>
              <button type="button" className="theme-toggle-btn" onClick={() => fileInputRef.current?.click()}>백업 파일 불러오기</button>
              <input ref={fileInputRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleImport} />
            </div>
          </section>
        )}

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
