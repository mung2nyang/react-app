// @ts-check
import { useMemo, useState } from 'react'
import { getTaxInvoiceFlowMeta, getTaxInvoiceSourceGroups } from '../lib/finance.js'
import { lastDayOfMonth, listMonthInvoices, saveInvoices } from '../lib/invoices.js'
import { formatWon } from '../lib/money.js'
import { buildFinanceSettings } from '../lib/ownerFinance.js'
import { changeTaxInvoiceStatus, saveTaxInvoiceDraft } from '../lib/taxInvoiceActions.js'
import {
  readOwnerInvoices,
  useOwnerCars,
  useOwnerClients,
  useOwnerDrivers,
  useOwnerInvoices,
  useOwnerProfile,
  useOwnerSettings,
  useOwnerWorkDataByLogId,
} from '../store/ownerDataHooks.js'
import TaxInvoiceDraftModal from './TaxInvoiceDraftModal.jsx'
import TaxInvoiceEntryList from './TaxInvoiceEntryList.jsx'
import TaxInvoiceToolbar from './TaxInvoiceToolbar.jsx'

/** @typedef {import('../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 */
export default function TaxInvoicePage({ ownerKey = 'guest', onBack, showToast }) {
  const clients = useOwnerClients(ownerKey)
  const cars = useOwnerCars(ownerKey)
  const practiceSettings = useOwnerSettings(ownerKey)
  const profile = useOwnerProfile(ownerKey)
  const drivers = useOwnerDrivers(ownerKey)
  const records = useOwnerInvoices(ownerKey)
  const [viewDate, setViewDate] = useState(() => new Date())
  const [tab, setTab] = useState(/** @type {'draft'|'issued'} */ ('draft'))
  const [flow, setFlow] = useState(/** @type {'sales'|'purchase'|'commission'} */ ('sales'))
  const [modalItem, setModalItem] = useState(/** @type {InvoiceLike|null} */ (null))

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  const settings = useMemo(() => {
    void clients
    void cars
    void practiceSettings
    void profile
    void drivers
    return buildFinanceSettings(ownerKey)
  }, [ownerKey, clients, cars, practiceSettings, profile, drivers])
  const workDataByLogId = useOwnerWorkDataByLogId(ownerKey)
  const flowMeta = getTaxInvoiceFlowMeta(flow)
  const listed = useMemo(
    () => listMonthInvoices(monthKey, flow, settings, workDataByLogId, records),
    [monthKey, flow, settings, workDataByLogId, records],
  )
  /** @type {Array<InvoiceLike>} */
  const entries = /** @type {Array<InvoiceLike>} */ (tab === 'issued' ? listed.issuedEntries : listed.draftEntries)
  const supplyTotal = entries.reduce((sum, item) => sum + Number(item.supplyAmount || 0), 0)
  const taxTotal = entries.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0)
  const flowCounts = useMemo(() => ({
    sales: getTaxInvoiceSourceGroups(monthKey, 'sales', settings, workDataByLogId).length,
    purchase: getTaxInvoiceSourceGroups(monthKey, 'purchase', settings, workDataByLogId).length,
    commission: getTaxInvoiceSourceGroups(monthKey, 'commission', settings, workDataByLogId).length,
  }), [monthKey, settings, workDataByLogId])
  const issuerReady = settings.bizName && settings.bizNumber && settings.userName && settings.bizType && settings.bizItem

  /** @param {Array<InvoiceLike>} next */
  async function persist(next) {
    await saveInvoices(ownerKey, next)
  }

  /** @param {InvoiceLike} item */
  function openDraft(item) {
    setModalItem({
      ...item,
      issueDate: item.issueDate || lastDayOfMonth(monthKey),
      itemName: item.itemName || flowMeta.itemName,
    })
  }

  async function saveDraft() {
    if (!modalItem) return
    const closed = await saveTaxInvoiceDraft({
      ownerKey,
      clients,
      records: readOwnerInvoices(ownerKey),
      modalItem,
      persist,
      showToast,
    })
    if (closed) setModalItem(null)
  }

  /**
   * @param {InvoiceLike} item
   * @param {'draft'|'issued'} status
   */
  function changeStatus(item, status) {
    changeTaxInvoiceStatus({
      item,
      status,
      settings,
      records: readOwnerInvoices(ownerKey),
      persist,
      openDraft,
      showToast,
    })
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

      <TaxInvoiceToolbar
        viewDate={viewDate}
        setViewDate={setViewDate}
        flow={flow}
        onFlow={(id) => { setFlow(id); setTab('draft') }}
        flowCounts={flowCounts}
      />

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

      <TaxInvoiceEntryList
        entries={entries}
        tab={tab}
        flow={flow}
        emptyDraft={emptyDraft}
        flowMeta={flowMeta}
        onOpenDraft={openDraft}
        onChangeStatus={changeStatus}
      />

      {modalItem && (
        <TaxInvoiceDraftModal
          modalItem={modalItem}
          flowMeta={flowMeta}
          onChange={setModalItem}
          onCancel={() => setModalItem(null)}
          onSave={saveDraft}
        />
      )}
    </div>
  )
}
