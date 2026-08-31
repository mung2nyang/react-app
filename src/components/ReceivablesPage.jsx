import { useMemo, useState } from 'react'
import { formatWon, formatCurrencyInput, parseCurrencyValue } from '../lib/money.js'
import {
  buildFinanceSettings,
  markMonthlyReceivablesPaid,
  patchWorkLog,
  persistWorkDataByLogId,
} from '../lib/ownerFinance.js'
import { getReceivableItems } from '../lib/finance.js'
import {
  dueSoonItems,
  formatWorkMonth,
  getDdayLabel,
  groupByClientMonth,
  groupItems,
  receivableItemKey,
} from '../lib/receivables.js'
import { addPartialPayment, markReceivableItemPaid, undoLastPayment } from '../lib/workData.js'
import { useOwnerCars, useOwnerDrivers, useOwnerProfile, useOwnerSettings, useOwnerWorkDataByLogId } from '../store/ownerDataHooks.js'

export default function ReceivablesPage({ ownerKey = 'guest', onBack, showToast, onWorkChanged }) {
  const workDataByLogId = useOwnerWorkDataByLogId(ownerKey)
  const [tab, setTab] = useState('monthly')
  const [detail, setDetail] = useState(null)
  const [partialKey, setPartialKey] = useState('')
  const [partialAmount, setPartialAmount] = useState('')
  const [historyKey, setHistoryKey] = useState('')

  const cars = useOwnerCars(ownerKey)
  const practiceSettings = useOwnerSettings(ownerKey)
  const profile = useOwnerProfile(ownerKey)
  const drivers = useOwnerDrivers(ownerKey)
  const settings = useMemo(() => {
    void cars
    void practiceSettings
    void profile
    void drivers
    return buildFinanceSettings(ownerKey)
  }, [ownerKey, workDataByLogId, cars, practiceSettings, profile, drivers])
  const items = useMemo(() => getReceivableItems(settings, workDataByLogId), [settings, workDataByLogId])
  const groups = useMemo(() => groupByClientMonth(items), [items])
  const dueItems = useMemo(() => dueSoonItems(items), [items])
  const hasSubCars = (settings.cars || []).some((car) => car.type === 'sub')
  const detailItems = detail ? groupItems(items, detail.client, detail.monthKey) : []
  const detailTotal = detailItems.reduce((sum, item) => sum + item.remainingAmount, 0)
  const dueDates = detailItems.map((item) => item.paymentDueDate).filter(Boolean).sort()

  function persist(next) {
    persistWorkDataByLogId(ownerKey, next)
    onWorkChanged?.()
  }

  function applyPatch(logId, dateKey, detailIndex, apply, successMessage) {
    const result = patchWorkLog(workDataByLogId, logId, dateKey, detailIndex, apply)
    if (result.error) {
      showToast?.(result.error)
      return
    }
    persist(result.workDataByLogId)
    setPartialKey('')
    setPartialAmount('')
    showToast?.(successMessage)
  }

  function payItem(item) {
    applyPatch(item.logId, item.dateKey, item.detailIndex, (store, dateKey, detailIndex) => (
      markReceivableItemPaid(store, dateKey, detailIndex)
    ), '입금 완료 처리했습니다.')
  }

  function payGroup(clientName, monthKey, stay) {
    persist(markMonthlyReceivablesPaid(workDataByLogId, settings, clientName, monthKey))
    showToast?.(`${clientName} ${parseInt(monthKey.slice(5, 7), 10)}월분 미수금을 수금 완료 처리했습니다.`)
    if (stay && detail) return
    setDetail(null)
  }

  function confirmPartial(item) {
    applyPatch(item.logId, item.dateKey, item.detailIndex, (store, dateKey, detailIndex) => (
      addPartialPayment(store, dateKey, detailIndex, partialAmount)
    ), '부분 입금을 등록했습니다.')
  }

  function undoPayment(item) {
    if (!window.confirm('가장 최근 입금 기록 1건을 취소하시겠습니까?')) return
    applyPatch(item.logId, item.dateKey, item.detailIndex, (store, dateKey, detailIndex) => (
      undoLastPayment(store, dateKey, detailIndex)
    ), '입금 기록을 취소했습니다.')
  }

  function renderItemCard(item, compact) {
    const key = receivableItemKey(item)
    const isPartial = item.paymentSummaryStatus === 'partial'
    const payments = Array.isArray(item.payments) ? item.payments : []
    const dday = getDdayLabel(item.paymentDueDate)
    return (
      <div key={key} className="management-list-card receivable-detail-card">
        <div className="management-card-copy">
          {compact && <div className="client-card-title"><strong>{item.client}</strong></div>}
          {!compact && <div className="client-card-title"><strong>{formatWon(item.remainingAmount)}</strong></div>}
          {hasSubCars && <div className="car-sub-text">{item.logLabel}</div>}
          {!compact && (
            <div className="car-sub-text">
              {(item.loadLoc || item.unloadLoc)
                ? `${item.loadLoc || '상차지 미상'} → ${item.unloadLoc || '하차지 미상'}`
                : '운행 구간 미등록'}
            </div>
          )}
          <div className="car-sub-text">{item.workDate.replace(/-/g, '.')} · {formatWorkMonth(String(item.workDate).slice(0, 7))}</div>
          {item.paymentDueDate && <div className="car-sub-text">입금 예정일: {item.paymentDueDate.replace(/-/g, '.')}</div>}
          {dday && <div className={`receivable-dday${dday.includes('연체') ? ' overdue' : ''}`}>{dday}</div>}
          <div className={`receivable-payment-status ${isPartial ? 'partial' : 'unpaid'}`}>
            {isPartial ? `${formatWon(item.paidAmount)} 입금 · ${formatWon(item.remainingAmount)} 남음` : '미수'}
            <span> (전체 {formatWon(item.fare)})</span>
          </div>
          {compact && <strong className="receivable-amount">{formatWon(item.remainingAmount)}</strong>}
          {item.remarks && <div className="car-sub-text">{item.remarks}</div>}
          {payments.length > 0 && (
            <button type="button" className="action-icon-btn" onClick={() => setHistoryKey(historyKey === key ? '' : key)}>
              입금 내역 {payments.length}건
            </button>
          )}
          {historyKey === key && payments.map((payment) => (
            <div key={payment.id || payment.paidAt} className="receivable-payment-history-row">
              <span>{payment.paidAt ? new Date(payment.paidAt).toLocaleString('ko-KR') : '-'}</span>
              <span>{formatWon(parseCurrencyValue(payment.amount))}</span>
            </div>
          ))}
        </div>
        {!compact && (
          <div className="car-action-btns">
            <button type="button" className="action-icon-btn" onClick={() => payItem(item)}>이 건 입금 완료</button>
            <button
              type="button"
              className="action-icon-btn"
              onClick={() => {
                setPartialKey(partialKey === key ? '' : key)
                setPartialAmount('')
              }}
            >
              부분 입금
            </button>
            {payments.length > 0 && (
              <button type="button" className="action-icon-btn del" onClick={() => undoPayment(item)}>취소</button>
            )}
          </div>
        )}
        {partialKey === key && (
          <div className="receivable-partial-input-row">
            <input
              className="input-box"
              inputMode="numeric"
              placeholder="입금액 입력"
              value={formatCurrencyInput(partialAmount)}
              onChange={(e) => setPartialAmount(e.target.value)}
            />
            <button type="button" className="modal-btn confirm" onClick={() => confirmPartial(item)}>확인</button>
          </div>
        )}
      </div>
    )
  }

  if (detail) {
    return (
      <div className="page receivables-page">
        <div className="settings-header">
          <button type="button" className="icon-btn" title="뒤로가기" onClick={() => setDetail(null)}>
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <div className="settings-title">미수금 상세</div>
          <div style={{ width: 40 }}></div>
        </div>

        <section className="receivable-detail-summary">
          <div className="receivable-detail-eyebrow">{formatWorkMonth(detail.monthKey)}</div>
          <h2>{detail.client}</h2>
          <div className="receivable-detail-total">
            <span>총 미수금</span>
            <strong>{formatWon(detailTotal)}</strong>
          </div>
          <div className="car-sub-text">{detailItems.length}건 · {dueDates.length ? `입금 예정일 ${dueDates[0].replace(/-/g, '.')}` : '입금 예정일 미등록'}</div>
        </section>

        {detailItems.length === 0 && <div className="empty-state">모든 미수금이 입금 완료 처리되었습니다.</div>}
        {detailItems.map((item) => renderItemCard(item, false))}

        {detailItems.length > 0 && (
          <button type="button" className="personal-account-btn" onClick={() => payGroup(detail.client, detail.monthKey, true)}>
            전체 입금 완료 처리
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="page receivables-page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">미수금/정산 관리</div>
        <div style={{ width: 40 }}></div>
      </div>

      <div className="settings-segmented-control maint-fuel-tabs">
        <button type="button" className={`toggle-btn${tab === 'monthly' ? ' active-work' : ''}`} onClick={() => setTab('monthly')}>월별 묶음 정산</button>
        <button type="button" className={`toggle-btn${tab === 'due' ? ' active-work' : ''}`} onClick={() => setTab('due')}>입금 예정 미수금</button>
      </div>
      <p className="car-type-hint">운행 일지 세부 입력에서 자동으로 모읍니다. 부분 입금은 상세에서 기록합니다.</p>

      {tab === 'monthly' && (
        <>
          {groups.length === 0 && <div className="empty-state">미수금 내역이 없습니다.</div>}
          {groups.map((group) => (
            <div key={`${group.client}-${group.monthKey}`} className="management-list-card receivable-group-card">
              <div className="management-card-copy">
                <div className="client-card-title"><strong>{group.client}</strong></div>
                <div className="car-sub-text">{formatWorkMonth(group.monthKey)}</div>
                {hasSubCars && (
                  <div className="car-sub-text">{[...new Map(group.items.map((item) => [item.logId, item.logLabel])).values()].join(' · ')}</div>
                )}
                <div className="receivable-group-summary">
                  <span>미수금</span>
                  <strong>{formatWon(group.total)}</strong>
                  <span>· {group.count}건</span>
                </div>
              </div>
              <div className="receivable-card-actions">
                <button type="button" className="action-icon-btn" onClick={() => setDetail({ client: group.client, monthKey: group.monthKey })}>상세</button>
                <button type="button" className="action-icon-btn" onClick={() => payGroup(group.client, group.monthKey, false)}>입금 완료</button>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === 'due' && (
        <>
          {dueItems.length === 0 && <div className="empty-state">D-3 이내 또는 연체된 미수금이 없습니다.</div>}
          {dueItems.map((item) => renderItemCard(item, true))}
        </>
      )}
    </div>
  )
}
