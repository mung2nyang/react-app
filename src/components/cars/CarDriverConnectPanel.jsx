// @ts-check
/** @typedef {import('../../lib/outboxTypes.js').DriverRecord} DriverRecord */
import { formatInviteCode, generateInviteCode } from '../../lib/drivers.js'
import '../drivers/driver-connection.css'

/**
 * Sub-car "기사 연동 / 운행 일지" panel (slice F mockup).
 * @param {Object} props
 * @param {'link'|'log'} props.tab
 * @param {(tab: 'link'|'log') => void} props.onTab
 * @param {string} props.inviteCode
 * @param {(code: string) => void} props.onInviteCode
 * @param {Array<DriverRecord>} props.drivers
 */
export default function CarDriverConnectPanel({
  tab, onTab, inviteCode, onInviteCode, drivers,
}) {
  return (
    <div className="car-driver-connect">
      <div className="car-commission-type car-driver-connect-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'link'}
          className={tab === 'link' ? 'active' : ''}
          onClick={() => onTab('link')}
        >
          기사 연동
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'log'}
          className={tab === 'log' ? 'active' : ''}
          onClick={() => onTab('log')}
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
                readOnly
                value={formatInviteCode(inviteCode)}
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
