// @ts-check
// 기사 초대 폼 모달.
import { buildDriverInviteSmsHref } from '../lib/driverInviteSms.js'
import { formatInviteCode, generateInviteCode } from '../lib/drivers.js'
import { formatPhoneNumber } from '../lib/formatPhone.js'
import ClearableInput from './shared/ClearableInput.jsx'
import TemporalInput from './shared/TemporalInput.jsx'
import './drivers/driver-connection.css'

/** @typedef {import('../domain/drivers.js').DriverDraft} DriverDraft */
/** @typedef {import('../lib/outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */

/**
 * @template {DriverDraft} T
 * @param {Object} props
 * @param {T} props.draft
 * @param {(next: T) => void} props.setDraft
 * @param {string|null} [props.editingId]
 * @param {Array<DriverRecord>} props.drivers
 * @param {Array<CarLike>} props.assignableCars
 * @param {string} [props.ownerDisplayName]
 * @param {(message: string) => void} [props.showToast]
 * @param {() => void} props.onCancel
 * @param {() => void} props.onSave
 */
export default function DriverFormModal({ draft, setDraft, editingId, drivers, assignableCars, ownerDisplayName, showToast, onCancel, onSave }) {
  function sendInviteSms() {
    const result = buildDriverInviteSmsHref({
      name: draft.name,
      phone: draft.phone,
      inviteCode: draft.inviteCode,
      vehicleNumber: draft.vehicleNumber,
      ownerDisplayName,
      userAgent: navigator.userAgent,
    })
    if ('error' in result) {
      showToast?.(result.error)
      return
    }
    window.location.href = result.href
  }

  const linked = drivers.find((d) => d.id === editingId)?.status === 'linked'

  return (
    <div className="modal-overlay">
      <div className="modal-content client-modal driver-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{editingId ? '초대 수정' : '기사 초대'}</div>
        <div className="form-group">
          <label htmlFor="drvName">기사 이름</label>
          <ClearableInput id="drvName" className="input-box" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="drvPhone">기사 전화번호</label>
          <ClearableInput id="drvPhone" className="input-box" type="tel" placeholder="010-0000-0000" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: formatPhoneNumber(e.target.value) })} />
        </div>
        <div className="form-group">
          <label htmlFor="drvCode">초대 코드</label>
          <div className="driver-code-row">
            <input id="drvCode" className="input-box" readOnly disabled={linked} value={formatInviteCode(draft.inviteCode)} />
            <button type="button" className="theme-toggle-btn" disabled={linked} onClick={() => setDraft({ ...draft, inviteCode: generateInviteCode(drivers) })}>코드 생성</button>
            <button type="button" className="theme-toggle-btn" disabled={linked} onClick={sendInviteSms}>문자 보내기</button>
          </div>
          {linked && (
            <p className="driver-invite-note">
              초대 코드는 1회만 사용할 수 있습니다.<br />
              기존 연동을 해제하고 다시 연결할 경우, 새 코드를 발급해 주세요.
            </p>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="drvCar">배정 차량</label>
          <ClearableInput id="drvCar" className="input-box driver-car-input" list="drvCarOptions" placeholder="차량번호" value={draft.vehicleNumber} onChange={(e) => setDraft({ ...draft, vehicleNumber: e.target.value })} />
          <datalist id="drvCarOptions">
            {assignableCars.map((car, index) => (
              <option key={String(car.id || car.number || `car-${index}`)} value={car.number} />
            ))}
          </datalist>
        </div>
        <div className="personal-inline-fields">
          <div className="form-group">
            <label htmlFor="drvStart">계약 시작일</label>
            <TemporalInput type="date" id="drvStart" value={draft.startDate || ''} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="drvEnd">계약 종료일</label>
            <TemporalInput type="date" id="drvEnd" value={draft.endDate || ''} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
          </div>
        </div>
        <p className="car-type-hint">한 차량은 한 기사에게만 배정할 수 있습니다. 종료일이 없으면 계속 배정됩니다. 메인 차량은 배정할 수 없습니다.</p>
        <div className="modal-btns">
          <button type="button" className="modal-btn cancel" onClick={onCancel}>취소</button>
          <button type="button" className="modal-btn confirm" onClick={onSave}>저장</button>
        </div>
      </div>
    </div>
  )
}
