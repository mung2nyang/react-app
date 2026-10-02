// @ts-check
// §6: PDF/이미지 내보내기·공유 모달이 같은 exportRef·pdf-export-mode·viewMode/clientFilter를 공유해 나란히 둠(응집도). 달 이동은 documents/MonthNavigator.jsx(9-C-1), 보는 달은 서류 발급이 줌(9-C-2)
import { useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { formatWon } from '../lib/money.js'
import {
  buildDetailReportFileName,
  buildDetailReportImageFileName,
  buildReportFileName,
  buildReportImageFileName,
  dash,
} from '../lib/report.js'
import { buildDetailReport, detailReportClientOptions } from '../lib/reportDetail.js'
import { buildMonthReport } from '../lib/reportSummary.js'
import { useOwnerCars, useOwnerClients, useOwnerExpenses, useOwnerProfile, useOwnerSettings, useOwnerWorkDataByLogId } from '../store/ownerDataHooks.js'
import MonthNavigator from './documents/MonthNavigator.jsx'
import ReportDetailContent, { ReportClientPickerModal } from './ReportDetailView.jsx'
import { ReportSummaryContent } from './ReportSummaryContent.jsx'
import ReportShareModal from './ReportShareModal.jsx'
import PageHeader from './PageHeader.jsx'
import './report/report.css'

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {string} [props.logId] 특정 차량(연동기사 배정차량·미연동 서브차량)으로 스코프. 없으면 메인 차량.
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 * @param {(() => void)} [props.onOpenMenu]
 * @param {import('react').ReactNode} [props.tabs] 서류 발급 탭 줄 — 위 카드 달 이동 아래에 끼움
 * @param {Date} props.viewDate
 * @param {(next: Date) => void} props.onChangeMonth
 */
export default function ReportPage({ ownerKey = 'guest', logId: logIdProp, onBack, showToast, onOpenMenu, tabs, viewDate, onChangeMonth }) {
  const { logId: rawLogId } = useParams()
  const logKey = (logIdProp ?? (rawLogId ? decodeURIComponent(rawLogId) : undefined)) || 'main'
  const [savingPdf, setSavingPdf] = useState(false)
  const [savingImage, setSavingImage] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [viewMode, setViewMode] = useState(/** @type {'summary'|'detail'} */ ('summary'))
  const [clientFilter, setClientFilter] = useState('ALL')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerValue, setPickerValue] = useState('ALL')
  const exportRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const expenses = useOwnerExpenses(ownerKey)
  const allCars = useOwnerCars(ownerKey)
  const cars = useMemo(() => (logKey === 'main' ? allCars : allCars.filter((car) => car.number === logKey)), [allCars, logKey])
  const practiceSettings = useOwnerSettings(ownerKey)
  const workByLogId = useOwnerWorkDataByLogId(ownerKey)
  const workData = workByLogId[logKey] || {}
  const clients = useOwnerClients(ownerKey)
  const storedProfile = useOwnerProfile(ownerKey)
  const report = useMemo(
    () => buildMonthReport(ownerKey, year, month, expenses, cars, practiceSettings, workData, clients, storedProfile),
    [ownerKey, year, month, expenses, cars, practiceSettings, workData, clients, storedProfile],
  )
  const clientOptions = useMemo(
    () => detailReportClientOptions(workData, year, month, clients),
    [workData, year, month, clients],
  )
  const detailReport = useMemo(
    () => buildDetailReport(workData, year, month, clientFilter, { clients }),
    [workData, year, month, clientFilter, clients],
  )

  async function handleDownloadPdf() {
    const element = exportRef.current
    if (!element || savingPdf) return
    setSavingPdf(true)
    document.body.classList.add('pdf-export-mode')
    try {
      const mod = await import('html2pdf.js')
      const html2pdf = mod.default
      /** @type {Parameters<InstanceType<(typeof html2pdf)['Worker']>['set']>[0]} */
      const opt = {
        margin: [12, 10, 12, 10],
        filename: viewMode === 'detail'
          ? buildDetailReportFileName(year, month, clientFilter)
          : buildReportFileName(year, month),
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, scrollX: 0, scrollY: 0, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }
      await html2pdf().set(opt).from(element).save()
      showToast?.('PDF를 저장했습니다.')
    } catch (error) {
      console.error('PDF 저장 실패:', error)
      showToast?.('PDF 저장에 실패했습니다. 다시 시도해 주세요.')
    } finally {
      document.body.classList.remove('pdf-export-mode')
      setSavingPdf(false)
    }
  }

  async function handleDownloadImage() {
    const element = exportRef.current
    if (!element || savingImage) return
    setSavingImage(true)
    document.body.classList.add('pdf-export-mode')
    let imageUrl = ''
    try {
      const mod = await import('html2pdf.js')
      const html2pdf = mod.default
      const worker = html2pdf().set({
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          scrollX: 0,
          scrollY: 0,
          backgroundColor: '#ffffff',
          windowWidth: element.scrollWidth,
          windowHeight: element.scrollHeight,
        },
      }).from(element).toCanvas()
      const canvas = /** @type {HTMLCanvasElement} */ (await worker.get('canvas'))
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 이미지 생성 실패'))), 'image/png')
      })
      const fileName = viewMode === 'detail'
        ? buildDetailReportImageFileName(year, month, clientFilter)
        : buildReportImageFileName(year, month)
      imageUrl = URL.createObjectURL(/** @type {Blob} */ (blob))
      const link = document.createElement('a')
      link.download = fileName
      link.href = imageUrl
      document.body.appendChild(link)
      link.click()
      link.remove()
      showToast?.('이미지를 저장했습니다.')
    } catch (error) {
      console.error('운송비 내역서 이미지 저장 실패:', error)
      showToast?.('이미지 저장에 실패했습니다.')
    } finally {
      if (imageUrl) setTimeout(() => URL.revokeObjectURL(imageUrl), 1000)
      document.body.classList.remove('pdf-export-mode')
      setSavingImage(false)
    }
  }

  function openDetailPicker() {
    setPickerValue(clientFilter)
    setPickerOpen(true)
  }

  function confirmDetailPicker() {
    setClientFilter(pickerValue)
    setViewMode('detail')
    setPickerOpen(false)
    showToast?.('세부 내역서가 조회되었습니다.')
  }

  return (
    <div className="page report-page-wrap">
      <PageHeader title="서류 발급" onBack={onBack} onOpenMenu={onOpenMenu} />

      <div className="report-top-card">
        <MonthNavigator viewDate={viewDate} onChange={onChangeMonth} />
        {tabs}
        <div className="doc-scope-tabs" role="tablist" aria-label="내역 범위">
          <button type="button" role="tab" aria-selected={viewMode === 'summary'} className={`doc-scope-tab${viewMode === 'summary' ? ' active' : ''}`} onClick={() => setViewMode('summary')}>전체</button>
          <button type="button" role="tab" aria-selected={viewMode === 'detail'} className={`doc-scope-tab${viewMode === 'detail' ? ' active' : ''}`} onClick={openDetailPicker}>세부내역(거래처선택)</button>
        </div>
      </div>

      <div id="reportContentToExport" ref={exportRef}>
        {viewMode === 'detail' ? (
          <ReportDetailContent
            report={detailReport}
            clientFilter={clientFilter}
            showClientColumn={clientFilter === 'ALL'}
            profile={report.profile}
            car={report.mainCar}
          />
        ) : (
          <ReportSummaryContent
            profile={report.profile}
            car={report.mainCar}
            report={report}
            dash={dash}
            formatWon={formatWon}
            distanceOn={!!practiceSettings.distanceOn}
            isExporting={savingPdf || savingImage}
          />
        )}
      </div>

      <div className="doc-action-card">
        <div className="report-pdf-actions">
          <button type="button" className="theme-toggle-btn" disabled={savingPdf} onClick={handleDownloadPdf}>
            {savingPdf ? 'PDF 저장 중…' : 'PDF 다운로드'}
          </button>
          <button type="button" className="theme-toggle-btn" disabled={savingImage} onClick={handleDownloadImage}>
            {savingImage ? '이미지 저장 중…' : '이미지 저장'}
          </button>
          <button type="button" className="theme-toggle-btn" onClick={() => setShareOpen(true)}>공유</button>
        </div>
      </div>

      <ReportClientPickerModal
        open={pickerOpen}
        options={clientOptions}
        value={pickerValue}
        onChange={setPickerValue}
        onConfirm={confirmDetailPicker}
        onClose={() => setPickerOpen(false)}
      />
      {shareOpen && (
        <ReportShareModal
          exportRef={exportRef}
          viewMode={viewMode}
          clientFilter={clientFilter}
          clients={clients}
          year={year}
          month={month}
          onClose={() => setShareOpen(false)}
          showToast={showToast}
        />
      )}
    </div>
  )
}
