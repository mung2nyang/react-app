// @ts-check
import { useState } from 'react'
import { formatPhoneNumber } from '../../lib/formatPhone.js'
import { formatPercentInput } from '../../lib/money.js'
import CarDriverConnectPanel from './CarDriverConnectPanel.jsx'

/**
 * @typedef {Object} CarFormDraft
 * @property {string} number
 * @property {string} tonnage
 * @property {'main'|'sub'} type
 * @property {string} driverName
 * @property {string} driverPhone
 * @property {string} driverPayMode
 * @property {string} driverSalaryAmount
 * @property {boolean} commEnabled
 * @property {string} commType
 * @property {string} commission
 * @property {string} inviteCode
 * @property {string} inviteStartDate
 * @property {string|null} inviteDriverId
 */

/**
 * @param {Object} props
 * @param {CarFormDraft} props.draft
 * @param {import('react').Dispatch<import('react').SetStateAction<CarFormDraft>>} props.setDraft
 * @param {string|null} props.editingId
 * @param {() => void} props.onCancel
 * @param {() => void} props.onSave
 * @param {boolean} [props.cloud]
 * @param {Array<import('../../lib/outboxTypes.js').DriverRecord>} [props.drivers]
 * @param {Record<string, import('../../domain/dayRecordTypes.js').DayRecordLike>|null|undefined} [props.dayLogByDate]
 */
export default function CarFormModal({
  draft, setDraft, editingId, onCancel, onSave,
  cloud = false, drivers = [], dayLogByDate = null,
}) {
  const isSub = draft.type === 'sub'
  const isSalary = draft.driverPayMode === 'salary'
  const [connectTab, setConnectTab] = useState(/** @type {'link'|'log'} */ ('link'))
  const showConnect = isSub && cloud

  function setRevenueMode() {
    setDraft((prev) => ({
      ...prev,
      driverPayMode: 'revenue',
      commEnabled: true,
      commType: 'percent',
    }))
  }

  function setSalaryMode() {
    setDraft((prev) => ({
      ...prev,
      driverPayMode: 'salary',
      commEnabled: false,
      commission: '',
    }))
  }

  /** @param {string} value */
  function onCommissionChange(value) {
    setDraft((prev) => ({
      ...prev,
      commission: formatPercentInput(value),
    }))
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content car-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          {editingId ? (isSub ? '기사 정보 수정' : '차량 수정') : (isSub ? '기사 등록' : '차량 등록')}
        </div>
        <div className="form-group">
          <label htmlFor="newCarNumber">차량번호</label>
          <input id="newCarNumber" className="input-box" placeholder="12가 3456" value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="newCarTonnage">차량 톤수</label>
          <input id="newCarTonnage" className="input-box" placeholder="예: 5톤, 11톤, 25톤" value={draft.tonnage} onChange={(e) => setDraft({ ...draft, tonnage: e.target.value })} />
        </div>
        {isSub && (
          <>
            <div className="form-group">
              <label htmlFor="newDriverName">기사명</label>
              <input id="newDriverName" className="input-box" placeholder="기사명을 입력하세요" value={draft.driverName} onChange={(e) => setDraft({ ...draft, driverName: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="newUserPhone">연락처</label>
              <input id="newUserPhone" className="input-box" type="tel" placeholder="010-0000-0000" value={draft.driverPhone} onChange={(e) => setDraft({ ...draft, driverPhone: formatPhoneNumber(e.target.value) })} />
            </div>
            <div className="form-group">
              <label htmlFor="newCarSettlementValue">정산</label>
              <p className="car-settlement-mode-guide">
                {isSalary
                  ? '건당(또는 월) 고정으로 기사에게 지급할 금액을 설정합니다.'
                  : '해당 차량(기사) 운행 매출 중 기사에게 지급할 비율(%)을 설정합니다.'}
              </p>
              <div className="car-commission-value">
                <div className="car-commission-type" role="group" aria-label="정산 방식">
                  <button type="button" className={!isSalary ? 'active' : ''} aria-pressed={!isSalary} onClick={setRevenueMode}>매출제</button>
                  <button type="button" className={isSalary ? 'active' : ''} aria-pressed={isSalary} onClick={setSalaryMode}>월급제</button>
                </div>
                <span className="car-commission-input">
                  {isSalary ? (
                    <input
                      id="newCarSettlementValue"
                      inputMode="numeric"
                      placeholder="0"
                      value={draft.driverSalaryAmount || ''}
                      onChange={(e) => setDraft({ ...draft, driverSalaryAmount: e.target.value.replace(/\D/g, '') })}
                    />
                  ) : (
                    <input
                      id="newCarSettlementValue"
                      inputMode="decimal"
                      placeholder="0"
                      value={draft.commission}
                      onChange={(e) => onCommissionChange(e.target.value)}
                    />
                  )}
                  <b>{isSalary ? '원' : '%'}</b>
                </span>
              </div>
            </div>
          </>
        )}
        {showConnect ? (
          <CarDriverConnectPanel
            tab={connectTab}
            onTab={setConnectTab}
            logEnabled={!!editingId}
            inviteCode={draft.inviteCode || ''}
            onInviteCode={(code) => setDraft({ ...draft, inviteCode: code })}
            drivers={drivers}
            dayLogByDate={dayLogByDate}
          />
        ) : (
          <p className="car-type-hint">{isSub ? '기사 차량으로 등록됩니다.' : '메인 차량으로 등록됩니다.'}</p>
        )}
        <div className="modal-btns">
          <button type="button" className="modal-btn cancel" onClick={onCancel}>취소</button>
          <button type="button" className="modal-btn confirm" onClick={onSave}>저장</button>
        </div>
      </div>
    </div>
  )
}
