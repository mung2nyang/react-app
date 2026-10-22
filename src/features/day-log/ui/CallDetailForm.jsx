// @ts-check
// 순서: 경로·톤수 → 거래처 → 운송료·부가세 → 계산서·입금일 → 시간·계기판·플랫폼 → 산재보험료·비고.
import { useState } from 'react'
import { dueDateForClient, getClientsForLog, getPaymentTermLabel, pinnedClients } from '../../../domain/clients.ts'
import { parseCurrencyValue, vatOf } from '../../../domain/money.ts'
import { checkCallDetailDraft } from '../../../domain/call-details.ts'
import { confirmLargeFareSave, draftFromDetail, emptyDraft } from './callDetailFormHelpers.js'
import LocationShortcuts from './LocationShortcuts.jsx'
import CallClientQuickAdd from './CallClientQuickAdd.jsx'
import CallOdometerFields from './CallOdometerFields.jsx'
import ClearableInput from '../../../shared/ui/ClearableInput.jsx'
import CurrencyInput from '../../../shared/ui/CurrencyInput.jsx'
import TemporalInput from '../../../shared/ui/TemporalInput.jsx'
import FieldError, { focusField, invalidProps } from '../../../shared/ui/FieldError.jsx'
import CallDetailPaymentFields, { CallInsuranceFeeField, CallVatExemptRow } from './CallDetailPaymentFields.jsx'
import './call-detail-form.css'
import { useSession } from '../../../data/cloud/sessionContext.js'

const PLATFORM_PRESETS = ['24시콜', '화물맨', '더운반', '원콜', '전국화물콜', '카카오T트럭커']

/** @typedef {import('./dayLogTypes.js').CallDetailLike} CallDetailLike */
/** @typedef {import('./dayLogTypes.js').ClientLike} ClientLike */
/** @typedef {import('./dayLogTypes.js').Settings} Settings */
/** @typedef {import('../../../domain/call-details.ts').CallDetailDraft} CallDetailDraft */

/**
 * @param {Object} props
 * @param {CallDetailLike|null} props.value 수정 중인 콜상세(없으면 신규)
 * @param {CallDetailLike|null} props.previousItem 직전 항목(신규일 때만 "동일하게 채우기"에 쓴다)
 * @param {string} props.dateKey
 * @param {Array<ClientLike>} props.clients
 * @param {Settings} props.settings
 * @param {string} [props.logId] 일지 차량 키(`main` 또는 서브 번호). workData용.
 * @param {string} [props.clientScopeKey] 거래처 스코프. 없으면 logId로 폴백.
 * @param {Array<string>} [props.locationShortcuts]
 * @param {Array<string>} [props.pinnedLocations]
 * @param {(location: string) => void} [props.onTogglePinnedLocation]
 * @param {(item: CallDetailDraft) => void} props.onSave
 * @param {() => void} props.onClose
 * @param {boolean} [props.isEmployedDriver] 기사연동 계정(고용된 기사 본인) 세션이면 산재보험료 칸을 숨긴다 — 자기 명의로 플랫폼 일을 받는 게 아니라서 의미가 없다.
 */
export default function CallDetailForm({
  value, previousItem, dateKey, clients, settings, logId, clientScopeKey, onSave, onClose,
  locationShortcuts = [], pinnedLocations = [], onTogglePinnedLocation, isEmployedDriver = false,
}) {
  const { ownerKey } = useSession()
  const [draft, setDraft] = useState(() => (value ? draftFromDetail(value, dateKey, clients) : { ...emptyDraft, paymentDueDate: dueDateForClient(dateKey, null) }))
  const [activeLocationTarget, setActiveLocationTarget] = useState(/** @type {'load'|'unload'} */ ('load'))

  const scopeKey = clientScopeKey || logId
  const scopedClients = /** @type {Array<ClientLike>} */ (getClientsForLog(clients, scopeKey))
  const shortcuts = /** @type {Array<ClientLike>} */ (pinnedClients(scopedClients))
  const [problem, setProblem] = useState(/** @type {ReturnType<typeof checkCallDetailDraft>} */ (null))
  // 세 칸 중 하나라도 채우면 표시를 거둔다.
  const shown = problem && checkCallDetailDraft(draft)
  const fareNumber = parseCurrencyValue(draft.fare)
  const vatPreview = !fareNumber
    ? ''
    : draft.vatExempt
      ? '면세 거래로 부가세가 적용되지 않습니다.'
      : `부가세 포함 ${(fareNumber + vatOf(fareNumber)).toLocaleString('ko-KR')}원`
  const selectedClient = clients.find((item) => item.companyName === draft.client)
  const paymentGuide = selectedClient
    ? getPaymentTermLabel(selectedClient.paymentTerm, selectedClient.paymentTermValue)
    : '거래처를 선택하면 결제 조건에 맞춰 자동 입력됩니다.'

  async function handleSave() {
    const found = checkCallDetailDraft(draft)
    setProblem(found)
    if (found) {
      focusField('callLoadLoc')
      return
    }
    if (await confirmLargeFareSave(draft.fare)) onSave(draft)
  }

  /** @param {string} name */
  function applyClient(name) {
    const client = clients.find((item) => item.companyName === name)
    setDraft((prev) => ({ ...prev, client: name, paymentDueDate: dueDateForClient(dateKey, client) }))
  }

  return (
    <div className="modal-content call-detail-modal-content">
      <div className="modal-title call-detail-modal-title">{`${Number(dateKey.slice(8, 10))}일 일지 세부 입력${value ? ' 수정' : ''}`}</div>
      {!value && previousItem && (
        <button type="button" className="call-detail-copy-prev-btn" onClick={() => setDraft(draftFromDetail(previousItem, dateKey, clients))}>
          ↺ 바로 전 내역 그대로 채우기
        </button>
      )}
      <div className="call-detail-panel call-route-panel">
        <div className="form-group">
          <label className="load-label" htmlFor="callLoadLoc">상차지</label>
          <ClearableInput id="callLoadLoc" className="input-box" placeholder="상차지 입력" value={draft.loadLoc} onFocus={() => setActiveLocationTarget('load')} onChange={(e) => setDraft({ ...draft, loadLoc: e.target.value })} {...invalidProps(shown, 'loadLoc', 'callLoadLoc')} />
          <FieldError problem={shown} field="loadLoc" inputId="callLoadLoc" />
        </div>
        <div className="form-group">
          <label className="unload-label" htmlFor="callUnloadLoc">하차지</label>
          <ClearableInput id="callUnloadLoc" className="input-box" placeholder="하차지 입력" value={draft.unloadLoc} onFocus={() => setActiveLocationTarget('unload')} onChange={(e) => setDraft({ ...draft, unloadLoc: e.target.value })} />
        </div>
        <LocationShortcuts
          locations={locationShortcuts}
          pinnedLocations={pinnedLocations}
          onSelect={(location) => setDraft({
            ...draft,
            ...(activeLocationTarget === 'unload' ? { unloadLoc: location } : { loadLoc: location }),
          })}
          onTogglePin={(location) => onTogglePinnedLocation?.(location)}
        />
      </div>
      {settings.cargoTonnageOn && (
        <div className="call-detail-panel">
          <div className="call-inline-field">
            <label htmlFor="callCargoTonnage">화물 톤수</label>
            <div className="input-with-suffix">
              <input id="callCargoTonnage" type="number" className="input-box" inputMode="decimal" min="0" step="0.1" placeholder="선택 입력" value={draft.cargoTonnage} onChange={(e) => setDraft({ ...draft, cargoTonnage: e.target.value })} />
              <span className="suffix">톤</span>
            </div>
          </div>
        </div>
      )}
      <div className="call-detail-panel call-client-panel">
        <label htmlFor="callClient">거래처</label>
        <div className="call-client-row">
          <ClearableInput id="callClient" className="input-box" list="callClientOptions" placeholder="직접 입력 또는 선택" value={draft.client} onChange={(e) => applyClient(e.target.value)} />
          <datalist id="callClientOptions">
            {scopedClients.map((client) => <option key={client.id} value={client.companyName} />)}
          </datalist>
          {ownerKey && (
            <CallClientQuickAdd
              clients={clients}
              logId={scopeKey}
              onClientAdded={applyClient}
            />
          )}
        </div>
        {shortcuts.length > 0 && (
          <div className="call-client-shortcuts">
            {shortcuts.map((client) => (
              <button key={client.id} type="button" className={`dark-pill-btn${draft.client === client.companyName ? ' active' : ''}`} onClick={() => applyClient(draft.client === client.companyName ? '' : client.companyName)}>{client.companyName}</button>
            ))}
          </div>
        )}
      </div>
      <div className="call-detail-panel call-money-panel">
        <div className="call-inline-field">
          <label htmlFor="callFare">운송료<br />(부가세 별도)</label>
          <div className="input-with-suffix">
            <CurrencyInput id="callFare" className="input-box" placeholder="운송료 입력" value={draft.fare} onValueChange={(fare) => setDraft({ ...draft, fare })} />
            <span className="suffix">원</span>
          </div>
        </div>
        <CallVatExemptRow draft={draft} setDraft={setDraft} />
        <p className="billing-settings-note">부가세 포함 금액이면 1.1로 나눈 금액을 입력해 주세요. (예: 110,000원 → 100,000원)</p>
        {vatPreview && <p className="billing-settings-note vat-preview">{vatPreview}</p>}
      </div>
      {settings.paymentOn && <CallDetailPaymentFields draft={draft} setDraft={setDraft} paymentGuide={paymentGuide} />}
      {settings.timeOn && (
        <div className="call-detail-panel call-two-column-panel">
          <div className="form-group">
            <label htmlFor="callDepartureTime">출발 시간</label>
            <TemporalInput type="time" id="callDepartureTime" value={draft.departureTime} centered onChange={(e) => setDraft({ ...draft, departureTime: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="callArrivalTime">도착 시간</label>
            <TemporalInput type="time" id="callArrivalTime" value={draft.arrivalTime} centered onChange={(e) => setDraft({ ...draft, arrivalTime: e.target.value })} />
          </div>
        </div>
      )}
      {settings.distanceOn && <CallOdometerFields draft={draft} setDraft={setDraft} />}
      {settings.platformOn && (
        <div className="call-detail-panel">
          <div className="call-inline-field platform-main-row">
            <label htmlFor="callPlatform">플랫폼</label>
            <ClearableInput id="callPlatform" className="input-box" placeholder="직접 입력 또는 선택" value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value })} />
          </div>
          <div className="call-platform-quick-list">
            {PLATFORM_PRESETS.map((name) => (
              <button key={name} type="button" className={`dark-pill-btn${draft.platform === name ? ' active' : ''}`} onClick={() => setDraft({ ...draft, platform: draft.platform === name ? '' : name })}>{name}</button>
            ))}
          </div>
        </div>
      )}
      {settings.paymentOn && !isEmployedDriver && <CallInsuranceFeeField draft={draft} setDraft={setDraft} />}
      <div className="call-detail-panel form-group call-remarks-panel">
        <label htmlFor="callRemarks">비고</label>
        <ClearableInput id="callRemarks" className="input-box" placeholder="특이사항 입력" value={draft.remarks} onChange={(e) => setDraft({ ...draft, remarks: e.target.value })} />
      </div>
      <div className="modal-btns call-detail-form-actions">
        <button type="button" className="modal-btn cancel" onClick={onClose}>취소</button>
        <button type="button" className="modal-btn confirm" onClick={handleSave}>저장</button>
      </div>
    </div>
  )
}