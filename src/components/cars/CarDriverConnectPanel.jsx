// @ts-check
/** @typedef {import('../../lib/outboxTypes.js').DriverRecord} DriverRecord */
import { generateInviteCode } from '../../lib/drivers.js'

/**
 * Sub-car "기사 연동 / 운행 일지" panel (slice F mockup).
 * @param {Object} props
 * @param {'link'|'log'} props.tab
 * @param {(tab: 'link'|'log') => void} props.onTab
 * @param {boolean} props.logEnabled  false for brand-new car (!editingId)
 * @param {string} props.inviteCode
 * @param {(code: string) => void} props.onInviteCode
 * @param {Array<DriverRecord>} props.drivers
 */
export default function CarDriverConnectPanel({
  tab, onTab, logEnabled, inviteCode, onInviteCode, drivers,
}) {
  return (
    <div className="car-driver-connect">
      <div className="settings-segmented-control maint-fuel-tabs car-driver-connect-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'link'}
          className={`toggle-btn${tab === 'link' ? ' active-work' : ''}`}
          onClick={() => onTab('link')}
        >
          기사 연동
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'log'}
          className={`toggle-btn${tab === 'log' ? ' active-work' : ''}`}
          disabled={!logEnabled}
          onClick={() => { if (logEnabled) onTab('log') }}
        >
          운행 일지
        </button>
      </div>

      {tab === 'link' && (
        <div className="car-driver-connect-body">
          <p className="car-driver-connect-copy">
            기사를 초대해 차량을 배정하세요.
            <br />
            (배정된 기사가 작성한 운행 일지를 확인할 수 있습니다.)
          </p>
          <div className="form-group">
            <label htmlFor="carInviteCode">초대 코드</label>
            <div className="driver-code-row">
              <input
                id="carInviteCode"
                className="input-box"
                inputMode="numeric"
                maxLength={6}
                value={inviteCode}
                onChange={(e) => onInviteCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <button
                type="button"
                className="theme-toggle-btn"
                onClick={() => onInviteCode(generateInviteCode(drivers))}
              >
                코드 생성
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'log' && (
        <div className="car-driver-connect-body">
          <p className="car-type-hint">기사 연동 없이, 차주가 운행 일지를 직접 작성합니다.</p>
        </div>
      )}
    </div>
  )
}
