// Step 0-4 감사 보완 4차: DriverConnectionPage.jsx(214줄, 200줄 제한 위반)에서 초대
// 폼 모달만 분리했다. 로직은 한 글자도 안 바꿨다.
import { generateInviteCode } from '../lib/drivers.js'
import { formatPhoneNumber } from '../lib/formatPhone.js'

export default function DriverFormModal({ draft, setDraft, editingId, drivers, assignableCars, onCancel, onSave }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content client-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{editingId ? '초대 수정' : '기사 초대'}</div>
        <div className="form-group">
          <label htmlFor="drvName">기사 이름</label>
          <input id="drvName" className="input-box" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="drvPhone">기사 전화번호</label>
          <input id="drvPhone" className="input-box" type="tel" placeholder="010-0000-0000" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: formatPhoneNumber(e.target.value) })} />
        </div>
        <div className="form-group">
          <label htmlFor="drvCode">초대 코드</label>
          <div className="driver-code-row">
            <input id="drvCode" className="input-box" inputMode="numeric" maxLength={6} value={draft.inviteCode} onChange={(e) => setDraft({ ...draft, inviteCode: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
            <button type="button" className="theme-toggle-btn" onClick={() => setDraft({ ...draft, inviteCode: generateInviteCode(drivers) })}>코드 생성</button>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="drvCar">할당 차량</label>
          <input id="drvCar" className="input-box" list="drvCarOptions" placeholder="차량번호" value={draft.vehicleNumber} onChange={(e) => setDraft({ ...draft, vehicleNumber: e.target.value })} />
          <datalist id="drvCarOptions">
            {assignableCars.map((car, index) => (
              <option key={String(car.id || car.number || `car-${index}`)} value={car.number} />
            ))}
          </datalist>
        </div>
        <div className="personal-inline-fields">
          <div className="form-group">
            <label htmlFor="drvStart">할당 시작일</label>
            <input id="drvStart" type="date" className="input-box" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="drvEnd">할당 종료일</label>
            <input id="drvEnd" type="date" className="input-box" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
          </div>
        </div>
        <p className="car-type-hint">한 차량은 한 기사에게만 할당할 수 있습니다. 종료일이 없으면 계속 할당됩니다. 메인 차량은 할당할 수 없습니다.</p>
        <div className="modal-btns">
          <button type="button" className="modal-btn cancel" onClick={onCancel}>취소</button>
          <button type="button" className="modal-btn confirm" onClick={onSave}>저장</button>
        </div>
      </div>
    </div>
  )
}
