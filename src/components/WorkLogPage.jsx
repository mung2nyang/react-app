import { useState } from 'react'
import ExpenseFormModal from './ExpenseFormModal.jsx'
import InlineExpandHost from './InlineExpandHost.jsx'
import { dueDateForClient, getPaymentTermLabel, pinnedClients } from '../lib/clients.js'
import {
  emptyExpenseDraft,
  expenseTitle,
  filterByDate,
  KINDS,
  loadExpenses,
  removeExpense,
  saveExpenses,
  upsertExpense,
} from '../lib/expenses.js'
import { getCallDetailDurationMinutes, getDetailPaymentSummary } from '../lib/finance.js'
import { formatCurrencyInput, formatWon, parseCurrencyValue } from '../lib/money.js'
import { loadPracticeSettings } from '../lib/practiceSettings.js'
import {
  applyFixedRouteRun,
  callFareTotal,
  callVatTotal,
  computeDistanceKm,
  getCallDetails,
  getFixedRouteCounts,
  removeCallDetail,
  toggleCallPaymentStatus,
  upsertCallDetail,
} from '../lib/workData.js'

const PLATFORM_PRESETS = ['24시콜', '화물맨', '더운반', '원콜', '전국화물콜', '카카오T트럭커']
const RECEIPT_PRESETS = ['전자', '일반', '카드', '현금', '송금']
const KIND_ADD_CLASS = {
  maint: 'maint-add-direct-btn',
  fuel: 'fuel-add-direct-btn',
  misc: 'misc-add-direct-btn',
}
const KIND_TITLE_CLASS = {
  maint: 'maint-title-color',
  fuel: 'fuel-title-color',
  misc: 'misc-title-color',
}
const KIND_TOTAL_CLASS = {
  maint: 'maint-total-color',
  fuel: 'fuel-total-color',
  misc: 'misc-total-color',
}

const emptyDraft = {
  client: '',
  fare: '',
  vatExempt: false,
  loadLoc: '',
  unloadLoc: '',
  paymentDueDate: '',
  departureTime: '',
  arrivalTime: '',
  platform: '',
  cargoTonnage: '',
  receipt: '',
  remarks: '',
  startOdometer: '',
  endOdometer: '',
}

function draftFromDetail(item, dateKey, clients) {
  const client = clients.find((entry) => entry.companyName === item.client)
  return {
    client: item.client || '',
    fare: formatCurrencyInput(item.fare),
    vatExempt: !!item.vatExempt,
    loadLoc: item.loadLoc || '',
    unloadLoc: item.unloadLoc || '',
    paymentDueDate: item.paymentDueDate || dueDateForClient(dateKey, client),
    departureTime: item.departureTime || '',
    arrivalTime: item.arrivalTime || '',
    platform: item.platform || '',
    cargoTonnage: item.cargoTonnage || '',
    receipt: item.receipt || '',
    remarks: item.remarks || '',
    startOdometer: formatCurrencyInput(item.startOdometer),
    endOdometer: formatCurrencyInput(item.endOdometer),
  }
}

function commissionInfo(item) {
  const snap = item.commissionSnapshot
  if (!snap?.enabled) return { amount: 0, label: '' }
  const fare = parseCurrencyValue(item.fare)
  const amount = snap.type === 'percent' || !snap.type
    ? Math.floor(fare * (Number(snap.value) / 100))
    : parseCurrencyValue(snap.value)
  const label = snap.type === 'percent' || !snap.type ? `${snap.value}%` : formatWon(amount)
  return { amount, label }
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 1 2.81.7A2 2 0 0 1 22 16.92z"></path>
    </svg>
  )
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>
      <path d="M8 9h8M8 13h5"></path>
    </svg>
  )
}

function ExpenseIcon({ kind }) {
  if (kind === 'fuel') {
    return (
      <svg className="maint-fuel-icon" viewBox="0 0 24 24" aria-hidden="true">
        <line x1="3" x2="15" y1="22" y2="22"></line>
        <line x1="4" x2="14" y1="9" y2="9"></line>
        <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"></path>
        <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5"></path>
      </svg>
    )
  }
  if (kind === 'misc') {
    return (
      <svg className="maint-fuel-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h18M3 12h18M3 18h18"></path>
      </svg>
    )
  }
  return (
    <svg className="maint-fuel-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
    </svg>
  )
}

function formatCallTime(value) {
  if (!value) return '-'
  const [hourText, minute = '00'] = String(value).split(':')
  const hour = Number(hourText)
  if (Number.isNaN(hour)) return value
  return `${hour < 12 ? 'AM' : 'PM'}${hour % 12 || 12}시${minute === '00' ? '' : `${minute}분`}`
}

function durationSuffix(detail) {
  const minutes = getCallDetailDurationMinutes(detail)
  if (!minutes) return ''
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return ` (${hours ? `${hours}시간` : ''}${mins ? `${mins}분` : ''})`
}

export default function WorkLogPage({
  month,
  day,
  dateKey,
  count,
  isOff,
  record,
  clients = [],
  ownerKey = 'guest',
  settings: settingsProp,
  onCountChange,
  onOffChange,
  onCallDetailsChange,
  onRouteCountsChange,
  onClose,
  showToast,
}) {
  const value = !isOff && count > 0 ? String(count) : ''
  const details = getCallDetails(record)
  const settings = settingsProp || loadPracticeSettings(ownerKey)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState(-1)
  const [draft, setDraft] = useState(emptyDraft)
  const [expenses, setExpenses] = useState(() => loadExpenses(ownerKey))
  const [expenseKindPick, setExpenseKindPick] = useState(false)
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState(null)
  const [expenseDraft, setExpenseDraft] = useState(() => emptyExpenseDraft('maint', dateKey))
  const [messageIndex, setMessageIndex] = useState(-1)

  const callFare = callFareTotal({ ...record, isOff: false, callDetails: details })
  const callVat = callVatTotal({ ...record, isOff: false, callDetails: details })
  const dayExpenses = filterByDate(expenses, dateKey)
  const shortcuts = pinnedClients(clients)
  const distancePreview = computeDistanceKm(draft.startOdometer, draft.endOdometer)
  const odometerError = Boolean(draft.startOdometer && draft.endOdometer && !distancePreview)
  const routeCounts = getFixedRouteCounts(record)
  const routePresets = settings.fixedRouteOn ? (settings.fixedRoutePresets || []) : []
  const quickCounts = settings.runCountToggle ? (settings.runCountPresets || []) : []
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
  const totalDistance = details.reduce((sum, item) => sum + (parseFloat(item.distanceKm) || 0), 0)
  const totalCommission = details.reduce((sum, item) => sum + commissionInfo(item).amount, 0)
  const grandTotal = callFare - totalCommission + callVat

  function handleRouteRun(routeId, delta) {
    const nextCounts = applyFixedRouteRun(routeCounts, routeId, delta)
    const nextCount = Math.max(0, (Number(count) || 0) + delta)
    onRouteCountsChange?.(nextCounts, nextCount)
  }

  function openAdd() {
    setEditingIndex(-1)
    setDraft({ ...emptyDraft, paymentDueDate: dueDateForClient(dateKey, null) })
    setModalOpen(true)
  }

  function openEdit(index) {
    setEditingIndex(index)
    setDraft(draftFromDetail(details[index], dateKey, clients))
    setModalOpen(true)
  }

  function copyPreviousCall() {
    const prev = details[details.length - 1]
    if (!prev) return
    setDraft(draftFromDetail(prev, dateKey, clients))
  }

  function applyClient(name) {
    const client = clients.find((item) => item.companyName === name)
    setDraft((prev) => ({
      ...prev,
      client: name,
      paymentDueDate: dueDateForClient(dateKey, client),
    }))
  }

  function togglePinnedClient(name) {
    applyClient(draft.client === name ? '' : name)
  }

  function persistExpenses(next) {
    setExpenses(next)
    saveExpenses(ownerKey, next)
  }

  function openExpenseAdd(kind) {
    setExpenseKindPick(false)
    setEditingExpenseId(null)
    setExpenseDraft(emptyExpenseDraft(kind, dateKey))
    setExpenseModalOpen(true)
  }

  function openExpenseEdit(item) {
    setExpenseKindPick(false)
    setEditingExpenseId(item.id)
    setExpenseDraft({
      kind: item.kind,
      date: dateKey,
      name: item.name || '',
      category: item.category || (item.kind === 'misc' ? '통행료' : '엔진/미션'),
      fuelType: item.fuelType || '주유',
      payment: item.payment || '카드',
      cost: item.cost || 0,
      subsidy: item.subsidy || 0,
      mileage: item.mileage || 0,
      liters: item.liters || '',
    })
    setExpenseModalOpen(true)
  }

  function saveExpense() {
    const result = upsertExpense(expenses, { ...expenseDraft, date: dateKey }, editingExpenseId)
    if (result.error) {
      showToast?.(result.error)
      return
    }
    persistExpenses(result.items)
    setExpenseModalOpen(false)
    showToast?.(editingExpenseId ? '내역을 수정했습니다.' : '내역을 등록했습니다.')
  }

  function saveCall() {
    const result = upsertCallDetail(details, draft, editingIndex, dateKey, clients)
    if (result.error) {
      showToast?.(result.error)
      return
    }
    onCallDetailsChange(result.items)
    setModalOpen(false)
    showToast?.(editingIndex >= 0 ? '세부 입력을 수정했습니다.' : '세부 입력을 저장했습니다.')
  }

  function applyPayment(mutator, successMessage) {
    const store = { [dateKey]: { ...(record || {}), callDetails: details } }
    const result = mutator(store)
    if (result.error) {
      showToast?.(result.error)
      return
    }
    onCallDetailsChange(getCallDetails(result.data[dateKey]))
    showToast?.(successMessage)
  }

  function handleTogglePayment(index) {
    const unpaid = getDetailPaymentSummary(details[index]).status !== 'paid'
    applyPayment(
      (store) => toggleCallPaymentStatus(store, dateKey, index),
      unpaid ? '수금 처리했습니다.' : '수금을 취소했습니다.',
    )
  }

  function sendMessage(item, client) {
    const phone = client?.phone || ''
    if (!phone) {
      window.alert('거래처에 등록된 연락처가 없습니다.')
      return
    }
    const fare = parseCurrencyValue(item.fare).toLocaleString('ko-KR')
    const route = `${item.loadLoc || '상차지'} → ${item.unloadLoc || '하차지'}`
    const body = `안녕하세요, ${item.client || '거래처'} 담당자님. ${route} 운송료 ${fare}원이 미수 상태입니다. 확인 부탁드립니다.`
    const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?'
    window.location.href = `sms:${phone}${separator}body=${encodeURIComponent(body)}`
    setMessageIndex(-1)
  }

  return (
    <div className="page work-log-page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onClose}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="modal-title-stack">
          <div className="settings-title">{month}월 {day}일 운행 일지</div>
          <div className="autosave-status visible">입력하면 바로 저장됩니다</div>
        </div>
        <div style={{ width: 40 }}></div>
      </div>

      <div className="btn-group-toggle">
        <button
          type="button"
          className={`toggle-btn${isOff ? ' active-off' : ''}`}
          onClick={() => onOffChange(!isOff)}
        >
          휴무
        </button>
      </div>

      <div className={`modal-work-details${isOff ? ' is-off' : ''}`}>
        {settings.fixedOn && (
        <div className="modal-section fixed-route-section">
          <div className="modal-section-title">고정 노선</div>
          <div className="form-group fixed-route-group">
            <label htmlFor="modalFixedCountInput">운행 횟수 입력</label>
            <div className="fixed-route-input-row">
              <input
                id="modalFixedCountInput"
                type="number"
                className="input-box"
                inputMode="numeric"
                min="0"
                placeholder="0"
                value={value}
                disabled={isOff}
                onChange={(e) => onCountChange(e.target.value)}
              />
              <span className="fixed-route-unit">회 운행</span>
            </div>
            {quickCounts.length > 0 && (
              <div className="fixed-count-quick-buttons" aria-label="운행 횟수 빠른 선택">
                {quickCounts.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`quick-count-btn${count === n && !isOff ? ' active' : ''}`}
                    disabled={isOff}
                    onClick={() => onCountChange(count === n && !isOff ? 0 : n)}
                  >
                    {n}회
                  </button>
                ))}
              </div>
            )}
            {routePresets.length > 0 && (
              <div className="fixed-route-quick-buttons" aria-label="자주 다니는 노선 원탭 기록">
                {routePresets.map((route) => {
                  const routeCount = routeCounts[route.id] || 0
                  return (
                    <span key={route.id} className="fixed-route-chip">
                      <button
                        type="button"
                        className="fixed-route-chip-select"
                        disabled={isOff}
                        onClick={() => handleRouteRun(route.id, 1)}
                      >
                        {route.loadLoc} → {route.unloadLoc}
                        {routeCount > 0 && <span className="fixed-route-chip-count">{routeCount}회</span>}
                      </button>
                      {routeCount > 0 && (
                        <button
                          type="button"
                          className="fixed-route-chip-minus"
                          title="한 번 취소"
                          aria-label={`${route.loadLoc} → ${route.unloadLoc} 1회 취소`}
                          disabled={isOff}
                          onClick={() => handleRouteRun(route.id, -1)}
                        >
                          −
                        </button>
                      )}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        )}

        <div className="modal-section call-detail-section">
          <div className="modal-section-title">
            <span>운행 일지 세부 입력</span>
            <button type="button" className="compact-add-btn" onClick={openAdd}>+ 추가</button>
          </div>
          {details.map((item, index) => {
            const fare = parseCurrencyValue(item.fare)
            const payment = getDetailPaymentSummary(item)
            const unpaid = payment.status !== 'paid'
            const distance = parseFloat(item.distanceKm) || 0
            const specs = [
              settings.distanceOn && distance ? `운행거리:${distance}km` : '',
              settings.cargoTonnageOn && item.cargoTonnage ? `${item.cargoTonnage}톤` : '',
            ].filter(Boolean).join('　')
            const commission = commissionInfo(item)
            const client = clients.find((entry) => entry.companyName === item.client)
            return (
              <article key={`${item.workDate}-${index}`} className={`call-detail-card${unpaid ? ' unpaid-card' : ''}`}>
                <div className="call-detail-card-head">
                  <div className="call-detail-route">
                    <strong>{item.loadLoc || '상차지 미상'}</strong>
                    <span>➜</span>
                    <strong>{item.unloadLoc || '하차지 미상'}</strong>
                  </div>
                  <div className="call-detail-actions">
                    <button type="button" className="action-icon-btn" title="수정" onClick={() => openEdit(index)}><EditIcon /></button>
                    <button type="button" className="action-icon-btn del" title="삭제" onClick={() => onCallDetailsChange(removeCallDetail(details, index))}><DeleteIcon /></button>
                  </div>
                </div>
                {settings.timeOn && (item.departureTime || item.arrivalTime) && (
                  <div className="detail-meta-line">
                    출발:{formatCallTime(item.departureTime)} ➜ 도착:{formatCallTime(item.arrivalTime)}{durationSuffix(item)}
                  </div>
                )}
                <div className="detail-meta-line">
                  거래처: {item.client || '-'}
                  {commission.label ? <span className="commission-rate">수수료 {commission.label}</span> : null}
                </div>
                {specs && <div className="detail-meta-line">{specs}</div>}
                <div className="detail-meta-line">비고:{item.remarks || '-'}</div>
                <div className="call-detail-fare-line">
                  <span>운송료</span>
                  <strong>{fare.toLocaleString('ko-KR')}원</strong>
                </div>
                <div className="call-detail-card-foot">
                  <div className="detail-badges">
                    {settings.platformOn && item.platform && <span className="detail-badge">{item.platform}</span>}
                    {settings.paymentOn && item.receipt && <span className="detail-badge">{item.receipt}</span>}
                  </div>
                  {settings.paymentOn && (
                    <div className="detail-payment-actions">
                      {unpaid && (
                        client?.phone
                          ? <a href={`tel:${client.phone}`} className="call-phone-btn detail-call-phone" title="전화걸기" onClick={(e) => e.stopPropagation()}><PhoneIcon /></a>
                          : (
                            <button
                              type="button"
                              className="call-phone-btn detail-call-phone"
                              title="연락처 없음"
                              onClick={() => window.alert('거래처에 등록된 연락처가 없습니다.')}
                            >
                              <PhoneIcon />
                            </button>
                          )
                      )}
                      {unpaid && (
                        <button
                          type="button"
                          className="call-phone-btn detail-message-btn"
                          title="문자 보내기"
                          onClick={() => setMessageIndex(index)}
                        >
                          <MessageIcon />
                        </button>
                      )}
                      <button
                        type="button"
                        className={`payment-toggle-btn ${unpaid ? 'unpaid' : 'paid'}`}
                        onClick={() => handleTogglePayment(index)}
                      >
                        {unpaid ? '미수' : '수금'}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
          {details.length > 0 && (
            <div className="call-detail-daily-summary">
              <div><b>일일 운행거리</b><strong>{totalDistance} km</strong></div>
              {totalCommission > 0 && (
                <div className="commission-row"><b>수수료</b><strong>- {totalCommission.toLocaleString('ko-KR')}원</strong></div>
              )}
              <div><b>부가세(공급가액 기준 10%)</b><strong>{callVat.toLocaleString('ko-KR')}원</strong></div>
              <div className="summary-grand-total">
                <b>세부 내역 합계 ({details.length}건)</b>
                <strong>{grandTotal.toLocaleString('ko-KR')}원</strong>
              </div>
            </div>
          )}
          <div className="call-detail-add-row">
            <button type="button" className="call-detail-add-btn" onClick={openAdd}>+ 운행 일지 추가</button>
          </div>
          <InlineExpandHost open={modalOpen} className="call-detail-inline-host">
            <div className="modal-content call-detail-modal-content">
              <div className="modal-title call-detail-modal-title">
                {editingIndex >= 0 ? '운행 일지 세부 입력 수정' : '운행 일지 세부 입력'}
              </div>
              {editingIndex < 0 && details.length > 0 && (
                <button type="button" className="call-detail-copy-prev-btn" onClick={copyPreviousCall}>
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
                  <input
                    id="callFare"
                    className="input-box"
                    inputMode="numeric"
                    placeholder="운송료 입력"
                    value={draft.fare}
                    onChange={(e) => setDraft({ ...draft, fare: formatCurrencyInput(e.target.value) })}
                  />
                  <span>원</span>
                </div>
                <p className="billing-settings-note">부가세 포함 금액으로 계약하셨다면 ÷1.1 한 금액을 입력해 주세요.</p>
                {vatPreview && <p className="billing-settings-note vat-preview">{vatPreview}</p>}
                {settings.cargoTonnageOn && (
                  <div className="call-inline-field">
                    <label htmlFor="callCargoTonnage">화물 톤수</label>
                    <input
                      id="callCargoTonnage"
                      type="number"
                      className="input-box"
                      inputMode="decimal"
                      min="0"
                      step="0.1"
                      placeholder="선택 입력"
                      value={draft.cargoTonnage}
                      onChange={(e) => setDraft({ ...draft, cargoTonnage: e.target.value })}
                    />
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
                      <button key={name} type="button" className={`dark-pill-btn${draft.platform === name ? ' active' : ''}`} onClick={() => setDraft({ ...draft, platform: draft.platform === name ? '' : name })}>
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="call-detail-panel call-client-panel">
                <label htmlFor="callClient">거래처</label>
                <div className="call-client-row">
                  <input id="callClient" className="input-box" list="callClientOptions" placeholder="직접입력 또는 선택" value={draft.client} onChange={(e) => applyClient(e.target.value)} />
                  <datalist id="callClientOptions">
                    {clients.map((client) => <option key={client.id} value={client.companyName} />)}
                  </datalist>
                </div>
                {shortcuts.length > 0 && (
                  <div className="dark-pill-group call-client-shortcuts">
                    {shortcuts.map((client) => (
                      <button key={client.id} type="button" className={`dark-pill-btn${draft.client === client.companyName ? ' active' : ''}`} onClick={() => togglePinnedClient(client.companyName)}>
                        {client.companyName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {settings.paymentOn && (
                <div className="call-detail-panel">
                  <label>계산서</label>
                  <div className="dark-pill-group call-receipt-group">
                    {RECEIPT_PRESETS.map((name) => (
                      <button key={name} type="button" className={`dark-pill-btn${draft.receipt === name ? ' active' : ''}`} onClick={() => setDraft({ ...draft, receipt: draft.receipt === name ? '' : name })}>
                        {name}
                      </button>
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
                <button type="button" className="modal-btn cancel" onClick={() => setModalOpen(false)}>취소</button>
                <button type="button" className="modal-btn confirm" onClick={saveCall}>저장</button>
              </div>
            </div>
          </InlineExpandHost>
        </div>
        </div>

        <div className="modal-section maint-section">
          <div className="modal-section-title">
            <span>차량 정비/주유/기타</span>
            <button type="button" className="compact-add-btn" onClick={() => { setExpenseModalOpen(false); setExpenseKindPick(true) }}>+ 추가</button>
          </div>
          {KINDS.map((kindItem) => {
            const kindItems = dayExpenses.filter((item) => item.kind === kindItem.value)
            if (kindItems.length === 0) return null
            const kindTotal = kindItems.reduce((sum, item) => sum + (Number(item.cost) || 0), 0)
            return (
              <div key={kindItem.value} className="work-log-expense-group">
                {kindItems.map((item) => (
                  <div key={item.id} className="maint-fuel-item">
                    <div className="maint-fuel-head">
                      <div className={`maint-fuel-title ${KIND_TITLE_CLASS[kindItem.value]}`}>
                        <ExpenseIcon kind={kindItem.value} />
                        <strong>{expenseTitle(item, kindItem.label)}</strong>
                      </div>
                      <div className="maint-fuel-actions">
                        <button type="button" className="action-icon-btn" title="수정" onClick={() => openExpenseEdit(item)}><EditIcon /></button>
                        <button type="button" className="action-icon-btn del" title="삭제" onClick={() => persistExpenses(removeExpense(expenses, item.id))}><DeleteIcon /></button>
                      </div>
                    </div>
                    <div className="maint-fuel-info">
                      <div>
                        {item.kind === 'fuel'
                          ? (item.liters ? <span className="maint-fuel-note">{item.liters}L</span> : null)
                          : <span className="maint-payment-badge">{item.payment || '카드'}</span>}
                      </div>
                      <strong>{formatWon(item.cost)}</strong>
                    </div>
                  </div>
                ))}
                <div className={`maint-fuel-total ${KIND_TOTAL_CLASS[kindItem.value]}`}>
                  <strong>{kindItem.label} 합계</strong>
                  <strong>{formatWon(kindTotal)}</strong>
                </div>
              </div>
            )
          })}
          <div className="maint-fuel-add-row">
            {KINDS.map((item) => (
              <button key={item.value} type="button" className={`maint-fuel-add-btn ${KIND_ADD_CLASS[item.value]}`} onClick={() => openExpenseAdd(item.value)}>
                + {item.label} 추가
              </button>
            ))}
          </div>
          <InlineExpandHost open={expenseKindPick || expenseModalOpen} className="maint-fuel-inline-host">
            {expenseKindPick && (
              <div className="modal-content maint-fuel-select-inline">
                <div className="expense-kind-pick">
                  {KINDS.map((item) => (
                    <button key={item.value} type="button" className="modal-btn confirm" onClick={() => openExpenseAdd(item.value)}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {expenseModalOpen && (
              <ExpenseFormModal
                inline
                draft={expenseDraft}
                editingId={editingExpenseId}
                lockDate
                kindLabel={KINDS.find((item) => item.value === expenseDraft.kind)?.label || '정비'}
                onChange={setExpenseDraft}
                onClose={() => setExpenseModalOpen(false)}
                onSave={saveExpense}
              />
            )}
          </InlineExpandHost>
        </div>
      {messageIndex >= 0 && details[messageIndex] && (
        <div className="message-template-overlay" onClick={() => setMessageIndex(-1)}>
          <section className="message-template-sheet" role="dialog" aria-modal="true" aria-label="문자 양식 선택" onClick={(e) => e.stopPropagation()}>
            <div className="message-template-head">
              <div>
                <strong>문자 보내기</strong>
                <span>
                  {details[messageIndex].client || '거래처'}
                  {clients.find((item) => item.companyName === details[messageIndex].client)?.phone
                    ? ` · ${clients.find((item) => item.companyName === details[messageIndex].client).phone}`
                    : ''}
                </span>
              </div>
              <button type="button" onClick={() => setMessageIndex(-1)} aria-label="닫기">×</button>
            </div>
            <p className="message-template-help">보낼 양식을 선택하면 문자 앱에서 내용을 확인하고 수정할 수 있습니다.</p>
            <div className="message-template-list">
              <button type="button" onClick={() => sendMessage(details[messageIndex], clients.find((item) => item.companyName === details[messageIndex].client))}>
                <strong>미수금 안내</strong>
                <span>선택한 거래처로 미수 안내 문자를 보냅니다.</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

