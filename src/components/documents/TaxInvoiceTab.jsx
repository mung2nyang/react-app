// @ts-check
// 서류 발급 [세금계산서] 탭(세금계산서 정리 ②, 옛 TaxInvoicePage 몸통): 거래처 매출 계산서를 그 차량(logKey) 것만 + 엑셀 저장.
// 달은 서류 발급이 주고, 위 카드 = 달 이동 → 서류 탭 줄 → [작성 전][발급 완료].
import { useMemo, useState } from 'react'
import { getTaxInvoiceFlowMeta } from '../../lib/finance.js'
import { lastDayOfMonth, listMonthInvoices, saveInvoices, invoiceCanIssue } from '../../lib/invoices.js'
import { formatWon } from '../../lib/money.js'
import { buildFinanceSettings } from '../../lib/ownerFinance.js'
import { changeTaxInvoiceStatus, saveTaxInvoiceDraft } from '../../lib/taxInvoiceActions.js'
import { exportTaxInvoiceExcel } from '../../lib/taxInvoiceExcel.js'
import {
  readOwnerInvoices,
  useOwnerCars,
  useOwnerClients,
  useOwnerDrivers,
  useOwnerInvoices,
  useOwnerProfile,
  useOwnerSettings,
  useOwnerWorkDataByLogId,
} from '../../store/ownerDataHooks.js'
import TaxInvoiceDraftModal from '../TaxInvoiceDraftModal.jsx'
import TaxInvoiceEntryList from '../TaxInvoiceEntryList.jsx'
import MonthNavigator from './MonthNavigator.jsx'
import '../tax-invoice/tax-invoice.css'

/** @typedef {import('../../domain/financeTaxInvoiceEntries.js').InvoiceLike} InvoiceLike */

/**
 * @param {Object} props
 * @param {string} props.ownerKey
 * @param {string} props.logKey 'main' 또는 차량번호
 * @param {Date} props.viewDate
 * @param {(next: Date) => void} props.onChangeMonth
 * @param {import('react').ReactNode} [props.tabs]
 * @param {(message: string) => void} [props.showToast]
 */
export default function TaxInvoiceTab({ ownerKey, logKey, viewDate, onChangeMonth, tabs, showToast }) {
  const clients = useOwnerClients(ownerKey)
  const cars = useOwnerCars(ownerKey)
  const practiceSettings = useOwnerSettings(ownerKey)
  const profile = useOwnerProfile(ownerKey)
  const drivers = useOwnerDrivers(ownerKey)
  const records = useOwnerInvoices(ownerKey)
  const [tab, setTab] = useState(/** @type {'draft'|'issued'} */ ('draft'))
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
  const flowMeta = getTaxInvoiceFlowMeta()
  const listed = useMemo(
    () => listMonthInvoices(monthKey, 'sales', settings, workDataByLogId, records, logKey),
    [monthKey, settings, workDataByLogId, records, logKey],
  )
  /** @type {Array<InvoiceLike>} */
  const entries = /** @type {Array<InvoiceLike>} */ (tab === 'issued' ? listed.issuedEntries : listed.draftEntries)
  const supplyTotal = entries.reduce((sum, item) => sum + Number(item.supplyAmount || 0), 0)
  const taxTotal = entries.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0)
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

  /** @param {InvoiceLike} item */
  async function exportExcel(item) {
    const check = invoiceCanIssue(item, settings)
    if (!check.ok) {
      if (check.error) showToast?.(check.error)
      return
    }
    try {
      await exportTaxInvoiceExcel(item, settings, profile, monthKey)
      showToast?.('세금계산서 엑셀 파일을 저장했습니다.')
    } catch (error) {
      console.error('세금계산서 엑셀 저장 실패:', error)
      showToast?.('엑셀 저장에 실패했습니다.')
    }
  }

  return (
    <div className="tax-invoice-tab">
      <div className="report-top-card">
        <MonthNavigator viewDate={viewDate} onChange={onChangeMonth} />
        {tabs}
        <div className="doc-scope-tabs" role="tablist" aria-label="계산서 상태">
          <button type="button" role="tab" aria-selected={tab === 'draft'} className={`doc-scope-tab${tab === 'draft' ? ' active' : ''}`} onClick={() => setTab('draft')}>
            작성 전 <span className="tab-count-badge">{listed.draftEntries.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'issued'} className={`doc-scope-tab${tab === 'issued' ? ' active' : ''}`} onClick={() => setTab('issued')}>
            {flowMeta.completeLabel} <span className="tab-count-badge">{listed.issuedEntries.length}</span>
          </button>
        </div>
        {issuerReady && <p className="tax-invoice-issuer-line">{`${settings.bizName} · ${settings.bizNumber} · ${flowMeta.label}`}</p>}
      </div>

      {!issuerReady && (
        <div className="tax-invoice-guide">
          <p className="tax-invoice-guide-title">세금계산서를 발급받으려면 사업자 정보 입력이 필요합니다.</p>
          <p className="tax-invoice-guide-desc">마이페이지 → 개인정보에서 사업자 정보를 등록해 주세요.</p>
        </div>
      )}

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
        emptyDraft="계산서 발행 대상 거래처의 운행내역이 없습니다."
        flowMeta={flowMeta}
        onOpenDraft={openDraft}
        onExportExcel={exportExcel}
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
