// @ts-check
import { useState } from 'react'
import { dueDateForClient, getPaymentTermLabel, pinnedClients } from '../../lib/clients.js'
import { formatCurrencyInput, parseCurrencyValue } from '../../lib/money.js'
import { computeDistanceKm } from '../../lib/workData.js'
import { draftFromDetail, emptyDraft } from './callDetailFormHelpers.js'

const PLATFORM_PRESETS = ['24시콜', '화물맨', '더운반', '원콜', '전국화물콜', '카카오T트럭커']
const RECEIPT_PRESETS = ['전자', '일반', '카드', '현금', '송금']

/** @typedef {import('./dayLogTypes.js').CallDetailLike} CallDetailLike */
/** @typedef {import('./dayLogTypes.js').ClientLike} ClientLike */
/** @typedef {import('./dayLogTypes.js').Settings} Settings */
/** @typedef {import('../../domain/call-details.js').CallDetailDraft} CallDetailDraft */

/**
 * @param {Object} props
 * @param {CallDetailLike|null} props.value 수정 중인 콜상세(없으면 신규)
 * @param {CallDetailLike|null} props.previousItem 직전 항목(신규일 때만 "동일하게 채우기"에 쓴다)
 * @param {string} props.dateKey
 * @param {Array<ClientLike>} props.clients
 * @param {Settings} props.settings
 * @param {(item: CallDetailDraft) => void} props.onSave
 * @param {() => void} props.onClose
 */
export default function CallDetailForm({ value, previousItem, dateKey, clients, settings, onSave, onClose }) {
  const [draft, setDraft] = useState(() => (value ? draftFromDetail(value, dateKey, clients) : { ...emptyDraft, paymentDueDate: dueDateForClient(dateKey, null) }))

  const shortcuts = /** @type {Array<ClientLike>} */ (pinnedClients(clients))
  const distancePreview = computeDistanceKm(draft.startOdometer, draft.endOdometer)
  const odometerError = Boolean(draft.startOdometer && draft.endOdometer && !distancePreview)
  const fareNumber = parseCurrencyValue(draft.fare)
  const vatPreview = !fareNumber
    ? ''
    : draft.vatExempt
      ? '면세 거래로 부가세가 적용되지 않습니다.'
      : `부가세 포함 ${(fareNumber + Math.round(fareNumber * 0.1)).toLocaleString('ko-KR')}원`
  const selectedClient = clients.find((item) => item.companyName === draft.client)
  const paymentGuide = selectedClient
    ? getPaymentTermLabel(selectedClient.paymentTerm, selectedClient.paymentTermValue)
    : '거래처를 선택하면 결제 조건에 맞춰 자동 입력됩니다.'

  /** @param {string} name */
  function applyClient(name) {
    const client = clients.find((item) => item.companyName === name)
    setDraft((prev) => ({ ...prev, client: name, paymentDueDate: dueDateForClient(dateKey, client) }))
  }

  return (
    <div className="modal-content call-detail-modal-content">
      <div className="modal-title call-detail-modal-title">{value ? '운행 일지 세부 입력 수정' : '운행 일지 세부 입력'}</div>
      {!value && previousItem && (
        <button type="button" className="call-detail-copy-prev-btn" onClick={() => setDraft(draftFromDetail(previousItem, dateKey, clients))}>
          ↺ 직전 항목과 동일하게 채우기
        </button>
      )}
      <div className="call-detail-panel call-route-panel">
        <div className="form-group">
          <label className="load-label" htmlFor="callLoadLoc">상차지</label>
          <input id="callLoadLoc" className="input-box" placeholder="상차지 입력" value={draft.loadLoc} onChange={(e) => setDraft({ ...draft, loadLoc: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="unload-label" htmlFor="callUnloadLoc">하차지</label>
          <input id="callUnloadLoc" className="input-box" placeholder="하차지 입력" value={draft.unloadLoc} onChange={(e) => setDraft({ ...draft, unloadLoc: e.target.value })} />
        </div>
      </div>
      <div className="call-detail-panel call-money-panel">
        <div className="call-inline-field">
          <label htmlFor="callFare">운송료 (부가세 별도 금액)</label>
          <input id="callFare" className="input-box" inputMode="numeric" placeholder="운송료 입력" value={draft.fare} onChange={(e) => setDraft({ ...draft, fare: formatCurrencyInput(e.target.value) })} />
          <span>원</span>
        </div>
        <p className="billing-settings-note">부가세 포함 금액으로 계약하셨다면 ÷1.1 한 금액을 입력해 주세요.</p>
        {vatPreview && <p className="billing-settings-note vat-preview">{vatPreview}</p>}
        {settings.cargoTonnageOn && (
          <div className="call-inline-field">
            <label htmlFor="callCargoTonnage">화물 톤수</label>
            <input id="callCargoTonnage" type="number" className="input-box" inputMode="decimal" min="0" step="0.1" placeholder="선택 입력" value={draft.cargoTonnage} onChange={(e) => setDraft({ ...draft, cargoTonnage: e.target.value })} />
            <span>톤</span>
          </div>
        )}
      </div>
      {settings.timeOn && (
        <div className="call-detail-panel call-two-column-panel">
          <div className="form-group">
            <label htmlFor="callDepartureTime">출발 시간</label>
            <input id="callDepartureTime" type="time" className="input-box" value={draft.departureTime} onChange={(e) => setDraft({ ...draft, departureTime: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="callArrivalTime">도착 시간</label>
            <input id="callArrivalTime" type="time" className="input-box" value={draft.arrivalTime} onChange={(e) => setDraft({ ...draft, arrivalTime: e.target.value })} />
          </div>
        </div>
      )}
      {settings.distanceOn && (
        <div className="call-detail-panel call-two-column-panel">
          <div className="form-group">
            <label htmlFor="callStartOdometer">출발 계기판</label>
            <div className="input-with-suffix">
              <input id="callStartOdometer" className="input-box" inputMode="numeric" placeholder="출발 계기판" value={draft.startOdometer} onChange={(e) => setDraft({ ...draft, startOdometer: formatCurrencyInput(e.target.value) })} />
              <span className="suffix">km</span>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="callEndOdometer">마감 계기판</label>
            <div className="input-with-suffix">
              <input id="callEndOdometer" className={`input-box${odometerError ? ' input-error' : ''}`} inputMode="numeric" placeholder="마감 계기판" value={draft.endOdometer} onChange={(e) => setDraft({ ...draft, endOdometer: formatCurrencyInput(e.target.value) })} />
              <span className="suffix">km</span>
            </div>
          </div>
          {distancePreview && <p className="billing-settings-note">운행거리 {distancePreview}km</p>}
        </div>
      )}
      {settings.platformOn && (
        <div className="call-detail-panel">
          <div className="call-inline-field platform-main-row">
            <label htmlFor="callPlatform">플랫폼</label>
            <input id="callPlatform" className="input-box" placeholder="직접입력 또는 선택" value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value })} />
          </div>
          <div className="dark-pill-group call-platform-quick-list">
            {PLATFORM_PRESETS.map((name) => (
              <button key={name} type="button" className={`dark-pill-btn${draft.platform === name ? ' active' : ''}`} onClick={() => setDraft({ ...draft, platform: draft.platform === name ? '' : name })}>{name}</button>
            ))}
          </div>
        </div>
      )}
      <div className="call-detail-panel call-client-panel">
        <label htmlFor="callClient">거래처</label>
        <div className="call-client-row">
          <input id="callClient" className="input-box" list="callClientOptions" placeholder="직접입력 또는 선택" value={draft.client} onChange={(e) => applyClient(e.target.value)} />
          <datalist id="callClientOptions">
            {clients.filter((client) => !client.scopedToVehicleNumber).map((client) => <option key={client.id} value={client.companyName} />)}
          </datalist>
        </div>
        {shortcuts.length > 0 && (
          <div className="dark-pill-group call-client-shortcuts">
            {shortcuts.map((client) => (
              <button key={client.id} type="button" className={`dark-pill-btn${draft.client === client.companyName ? ' active' : ''}`} onClick={() => applyClient(draft.client === client.companyName ? '' : client.companyName)}>{client.companyName}</button>
            ))}
          </div>
        )}
      </div>
      {settings.paymentOn && (
        <div className="call-detail-panel">
          <label>계산서</label>
          <div className="dark-pill-group call-receipt-group">
            {RECEIPT_PRESETS.map((name) => (
              <button key={name} type="button" className={`dark-pill-btn${draft.receipt === name ? ' active' : ''}`} onClick={() => setDraft({ ...draft, receipt: draft.receipt === name ? '' : name })}>{name}</button>
            ))}
          </div>
          <div className="call-vat-row">
            <label htmlFor="callVatExempt">부가세 해제</label>
            <label className="switch">
              <input id="callVatExempt" type="checkbox" checked={draft.vatExempt} onChange={(e) => setDraft({ ...draft, vatExempt: e.target.checked })} />
              <span className="slider"></span>
            </label>
          </div>
          <div className="payment-due-date-box">
            <div className="form-group">
              <label htmlFor="callPaymentDueDate">입금 예정일</label>
              <input id="callPaymentDueDate" type="date" className="input-box" value={draft.paymentDueDate} onChange={(e) => setDraft({ ...draft, paymentDueDate: e.target.value })} />
            </div>
            <p className="payment-term-guide">{paymentGuide}</p>
          </div>
        </div>
      )}
      {!settings.paymentOn && (
        <div className="call-vat-row">
          <label htmlFor="callVatExempt">부가세 해제</label>
          <label className="switch">
            <input id="callVatExempt" type="checkbox" checked={draft.vatExempt} onChange={(e) => setDraft({ ...draft, vatExempt: e.target.checked })} />
            <span className="slider"></span>
          </label>
        </div>
      )}
      <div className="call-detail-panel form-group call-remarks-panel">
        <label htmlFor="callRemarks">비고</label>
        <input id="callRemarks" className="input-box" placeholder="특이사항 입력" value={draft.remarks} onChange={(e) => setDraft({ ...draft, remarks: e.target.value })} />
      </div>
      <div className="modal-btns call-detail-form-actions">
        <button type="button" className="modal-btn cancel" onClick={onClose}>취소</button>
        <button type="button" className="modal-btn confirm" onClick={() => onSave(draft)}>저장</button>
      </div>
    </div>
  )
}
