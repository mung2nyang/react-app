import { useMemo, useState } from 'react'
import { getYearOptions, setYearMonth, shiftMonth } from '../lib/calendar.js'
import { loadClients, saveClients, updateClientTaxInfo } from '../lib/clients.js'
import {
  getTaxInvoiceFlowMeta,
  getTaxInvoiceSourceGroups,
} from '../lib/finance.js'
import {
  invoiceCanIssue,
  lastDayOfMonth,
  listMonthInvoices,
  loadInvoices,
  persistInvoiceRecord,
  saveInvoices,
} from '../lib/invoices.js'
import { formatWon } from '../lib/money.js'
import { buildFinanceSettings, loadWorkDataByLogId } from '../lib/ownerFinance.js'

const YEAR_OPTIONS = getYearOptions()
const FLOWS = ['sales', 'purchase', 'commission']

export default function TaxInvoicePage({ ownerKey = 'guest', onBack, showToast }) {
  const [records, setRecords] = useState(() => loadInvoices(ownerKey))
  const [viewDate, setViewDate] = useState(() => new Date())
  const [tab, setTab] = useState('draft')
  const [flow, setFlow] = useState('sales')
  const [modalItem, setModalItem] = useState(null)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  const settings = useMemo(() => buildFinanceSettings(ownerKey), [ownerKey, records])
  const workDataByLogId = useMemo(() => loadWorkDataByLogId(ownerKey), [ownerKey, records])
  const flowMeta = getTaxInvoiceFlowMeta(flow)
  const listed = useMemo(
    () => listMonthInvoices(monthKey, flow, settings, workDataByLogId, records),
    [monthKey, flow, settings, workDataByLogId, records],
  )
  const entries = tab === 'issued' ? listed.issuedEntries : listed.draftEntries
  const supplyTotal = entries.reduce((sum, item) => sum + Number(item.supplyAmount || 0), 0)
  const taxTotal = entries.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0)
  const flowCounts = useMemo(() => ({
    sales: getTaxInvoiceSourceGroups(monthKey, 'sales', settings, workDataByLogId).length,
    purchase: getTaxInvoiceSourceGroups(monthKey, 'purchase', settings, workDataByLogId).length,
    commission: getTaxInvoiceSourceGroups(monthKey, 'commission', settings, workDataByLogId).length,
  }), [monthKey, settings, workDataByLogId])
  const issuerReady = settings.bizName && settings.bizNumber && settings.userName && settings.bizType && settings.bizItem

  function persist(next) {
    setRecords(next)
    saveInvoices(ownerKey, next)
  }

  function openDraft(item) {
    setModalItem({
      ...item,
      issueDate: item.issueDate || lastDayOfMonth(monthKey),
      itemName: item.itemName || flowMeta.itemName,
    })
  }

  function saveDraft() {
    if (!modalItem.clientBizNumber) {
      showToast?.('사업자등록번호를 입력해 주세요.')
      return
    }
    if (!modalItem.issueDate) {
      showToast?.('작성일자를 입력해 주세요.')
      return
    }
    const nextItem = { ...modalItem, updatedAt: new Date().toISOString() }
    persist(persistInvoiceRecord(records, nextItem))
    if (nextItem.partyType === 'client') {
      saveClients(ownerKey, updateClientTaxInfo(loadClients(ownerKey), nextItem.clientName, {
        bizNumber: nextItem.clientBizNumber,
        taxRepresentative: nextItem.clientRepresentative,
        taxEmail: nextItem.clientEmail,
        taxAddress: nextItem.clientAddress,
        taxBizType: nextItem.clientBizType,
        taxBizItem: nextItem.clientBizItem,
      }))
    }
    setModalItem(null)
    showToast?.('세금계산서 작성 내용을 저장했습니다.')
  }

  function changeStatus(item, status) {
    if (status === 'issued') {
      const check = invoiceCanIssue(item, settings)
      if (!check.ok) {
        showToast?.(check.error)
        if (check.needDraft) openDraft(item)
        return
      }
    }
    persist(persistInvoiceRecord(records, {
      ...item,
      status,
      issuedAt: status === 'issued' ? new Date().toISOString() : '',
    }))
    showToast?.(status === 'issued' ? `${getTaxInvoiceFlowMeta(item.flow).completeLabel}로 표시했습니다.` : '처리 전 상태로 되돌렸습니다.')
  }

  const emptyDraft = flow === 'sales'
    ? '계산서 발행 대상 거래처의 운행내역이 없습니다.'
    : flow === 'purchase'
      ? '회사 매입 방식으로 설정된 기사의 운행내역이 없습니다.'
      : '기사 직접발행 방식으로 설정된 수수료 내역이 없습니다.'

  return (
    <div className="page tax-invoice-page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">세금계산서</div>
        <div style={{ width: 40 }}></div>
      </div>

      <div className="maint-fuel-nav">
        <div className="date-navigator">
          <button type="button" className="arrow-btn" title="이전 달" onClick={() => setViewDate((d) => shiftMonth(d, -1))}>
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <div className="date-select-group">
            <select className="date-select" value={year} onChange={(e) => setViewDate(setYearMonth(viewDate, Number(e.target.value), month))}>
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select className="date-select" value={month} onChange={(e) => setViewDate(setYearMonth(viewDate, year, Number(e.target.value)))}>
              {Array.from({ length: 12 }, (_, m) => <option key={m} value={m}>{m + 1}월</option>)}
            </select>
          </div>
          <button type="button" className="arrow-btn" title="다음 달" onClick={() => setViewDate((d) => shiftMonth(d, 1))}>
            <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      </div>

      <div className="settings-segmented-control maint-fuel-tabs">
        {FLOWS.map((id) => (
          <button
            key={id}
            type="button"
            className={`toggle-btn${flow === id ? ' active-work' : ''}`}
            onClick={() => { setFlow(id); setTab('draft') }}
          >
            {getTaxInvoiceFlowMeta(id).label} {flowCounts[id]}
          </button>
        ))}
      </div>

      <p className={`tax-invoice-guide${issuerReady ? ' ready' : ''}`}>
        {flow === 'purchase'
          ? (issuerReady
            ? `기사에게 받을 매입 계산서 · ${settings.driverInvoiceBasis === 'gross' ? '총 운송료' : '수수료·산재보험 차감 후 기사 정산액'} 기준`
            : '마이페이지 → 개인정보에서 계산서를 받을 회사의 사업자 정보를 입력해 주세요.')
          : (issuerReady
            ? `${settings.bizName} · ${settings.bizNumber} · ${flowMeta.label}`
            : '마이페이지 → 개인정보에서 계산서를 발행할 회사의 사업자 정보를 입력해 주세요.')}
      </p>

      <div className="settings-segmented-control maint-fuel-tabs">
        <button type="button" className={`toggle-btn${tab === 'draft' ? ' active-work' : ''}`} onClick={() => setTab('draft')}>
          {flow === 'purchase' ? '수취 전' : '작성 전'} {listed.draftEntries.length}
        </button>
        <button type="button" className={`toggle-btn${tab === 'issued' ? ' active-work' : ''}`} onClick={() => setTab('issued')}>
          {flowMeta.completeLabel} {listed.issuedEntries.length}
        </button>
      </div>

      <div className="summary-card">
        <div className="summary-title">
          <span>{flowMeta.label} 월간 정산</span>
          <span>{entries.length}건</span>
        </div>
        <div className="summary-row"><span>공급가액</span><span className="summary-value">{formatWon(supplyTotal)}</span></div>
        <div className="summary-row"><span>부가세</span><span className="summary-value">{formatWon(taxTotal)}</span></div>
        <div className="summary-row total"><span>합계</span><span className="summary-value">{formatWon(supplyTotal + taxTotal)}</span></div>
      </div>

      {entries.length === 0 && (
        <div className="empty-state">{tab === 'issued' ? `${flowMeta.completeLabel} 내역이 없습니다.` : emptyDraft}</div>
      )}
      {entries.map((item) => (
        <div key={item.id} className="management-list-card">
          <div className="management-card-copy">
            <div className="client-card-title"><strong>{item.clientName}</strong></div>
            <div className="car-sub-text">{item.count || 0}건 · {item.clientBizNumber || '사업자번호 미입력'}</div>
            {item.vehicleLabel && <div className="car-sub-text">{item.vehicleLabel}</div>}
            {item.partyType === 'driver' && (
              <div className="car-sub-text">
                {item.carNumber} · 운송료 {formatWon(item.grossAmount || 0)}
                {item.commissionAmount ? ` · 수수료 ${formatWon(item.commissionAmount)}` : ''}
                {item.insuranceAmount ? ` · 산재보험 ${formatWon(item.insuranceAmount)}` : ''}
              </div>
            )}
            <div className="receivable-group-summary">
              <span>공급가 {formatWon(item.supplyAmount)}</span>
              <span>세액 {formatWon(item.taxAmount)}</span>
              <strong>{formatWon(item.totalAmount)}</strong>
            </div>
          </div>
          <div className="receivable-card-actions">
            <button type="button" className="action-icon-btn" onClick={() => openDraft(item)}>
              {item.status === 'issued' ? '내용 보기' : (flow === 'purchase' ? '내용 입력' : '작성하기')}
            </button>
            {item.status === 'issued'
              ? <button type="button" className="action-icon-btn del" onClick={() => changeStatus(item, 'draft')}>{flow === 'purchase' ? '수취 취소' : '발급 취소'}</button>
              : <button type="button" className="action-icon-btn" onClick={() => changeStatus(item, 'issued')}>{flowMeta.completeLabel}</button>}
          </div>
        </div>
      ))}

      {modalItem && (
        <div className="modal-overlay" onClick={() => setModalItem(null)}>
          <div className="modal-content client-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{flowMeta.label} 계산서</div>
            <div className="form-group">
              <label htmlFor="invClient">{flowMeta.partyHeading}</label>
              <input id="invClient" className="input-box" value={modalItem.clientName || ''} readOnly />
            </div>
            <div className="form-group">
              <label htmlFor="invBiz">사업자등록번호</label>
              <input id="invBiz" className="input-box" value={modalItem.clientBizNumber || ''} onChange={(e) => setModalItem({ ...modalItem, clientBizNumber: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="invRep">대표자</label>
              <input id="invRep" className="input-box" value={modalItem.clientRepresentative || ''} onChange={(e) => setModalItem({ ...modalItem, clientRepresentative: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="invItem">품목</label>
              <input id="invItem" className="input-box" value={modalItem.itemName || ''} onChange={(e) => setModalItem({ ...modalItem, itemName: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="invDate">작성일자</label>
              <input id="invDate" type="date" className="input-box" value={modalItem.issueDate || ''} onChange={(e) => setModalItem({ ...modalItem, issueDate: e.target.value })} />
            </div>
            <div className="tax-invoice-amount-grid">
              <div><span>공급가액</span><strong>{formatWon(modalItem.supplyAmount)}</strong></div>
              <div><span>세액</span><strong>{formatWon(modalItem.taxAmount)}</strong></div>
              <div className="total"><span>합계</span><strong>{formatWon(modalItem.totalAmount)}</strong></div>
            </div>
            <div className="form-group">
              <label htmlFor="invRemark">비고</label>
              <input id="invRemark" className="input-box" value={modalItem.remark || ''} onChange={(e) => setModalItem({ ...modalItem, remark: e.target.value })} />
            </div>
            <p className="car-type-hint">금액은 운행 일지 세부 입력에서 자동 집계됩니다. 실제 발급은 홈택스에서 해 주세요.</p>
            <div className="modal-btns">
              <button type="button" className="modal-btn cancel" onClick={() => setModalItem(null)}>취소</button>
              <button type="button" className="modal-btn confirm" onClick={saveDraft}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
