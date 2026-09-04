// @ts-check
/** @typedef {import('../../lib/outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {import('../../domain/dayRecordTypes.js').DayRecordLike} DayRecordLike */
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
 * @param {Record<string, DayRecordLike>|null|undefined} props.dayLogByDate
 * @param {string} [props.vehicleNumber]
 * @param {(vehicleNumber: string) => void} [props.onOpenVehicleLog]
 */
export default function CarDriverConnectPanel({
  tab, onTab, logEnabled, inviteCode, onInviteCode, drivers, dayLogByDate,
  vehicleNumber = '', onOpenVehicleLog,
}) {
  const dates = Object.keys(dayLogByDate || {}).sort().reverse().slice(0, 7)
  const canOpenLog = logEnabled && String(vehicleNumber || '').trim() !== ''

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
          {!logEnabled && (
            <p className="car-type-hint">저장 후 이 차량의 운행 일지를 확인할 수 있습니다.</p>
          )}
          {canOpenLog && (
            <button
              type="button"
              className="theme-toggle-btn car-open-vehicle-log"
              onClick={() => onOpenVehicleLog?.(String(vehicleNumber).trim())}
            >
              이 차량 일지 열기
            </button>
          )}
          {logEnabled && dates.length === 0 && (
            <p className="car-type-hint">이 차량의 운행 기록이 없습니다.</p>
          )}
          {logEnabled && dates.length > 0 && (
            <ul className="car-daylog-preview">
              {dates.map((dateKey) => {
                const record = dayLogByDate?.[dateKey]
                const trips = Array.isArray(record?.callDetails) ? record.callDetails.length : 0
                return (
                  <li key={dateKey}>
                    <span>{dateKey}</span>
                    <span>{trips}건</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
