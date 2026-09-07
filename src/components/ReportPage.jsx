// @ts-check
// §6: PDF/이미지 내보내기·공유 모달이 같은 exportRef·pdf-export-mode·viewMode/clientFilter를 공유해 나란히 둠(응집도, 240줄)
import { useMemo, useRef, useState } from 'react'
import { getYearOptions, setYearMonth, shiftMonth } from '../lib/calendar.js'
import { formatWon } from '../lib/money.js'
import {
  buildDetailReport,
  buildDetailReportFileName,
  buildDetailReportImageFileName,
  buildMonthReport,
  buildReportFileName,
  buildReportImageFileName,
  dash,
  detailReportClientOptions,
} from '../lib/report.js'
import { useOwnerCars, useOwnerClients, useOwnerExpenses, useOwnerProfile, useOwnerSettings, useOwnerWorkData } from '../store/ownerDataHooks.js'
import ReportDetailContent, { ReportClientPickerModal, ReportSummaryContent } from './ReportDetailView.jsx'
import ReportShareModal from './ReportShareModal.jsx'

const YEAR_OPTIONS = getYearOptions()

/**
 * @param {Object} props
 * @param {string} [props.ownerKey]
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 */
export default function ReportPage({ ownerKey = 'guest', onBack, showToast }) {
  const [viewDate, setViewDate] = useState(() => new Date())
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
  const cars = useOwnerCars(ownerKey)
  const practiceSettings = useOwnerSettings(ownerKey)
  const workData = useOwnerWorkData(ownerKey)
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
  const clientText = clientFilter === 'ALL' ? '전체' : clientFilter
  const detailTitle = `${year}년 ${month + 1}월 운송비 내역서 (${clientText})`

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

  function handleHeaderBack() {
    if (viewMode === 'detail') {
      setViewMode('summary')
      return
    }
    onBack?.()
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
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={handleHeaderBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">운송비 내역서</div>
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

      <div className="report-pdf-actions">
        {viewMode === 'summary' && (
          <button type="button" className="theme-toggle-btn" onClick={openDetailPicker}>세부 내역서</button>
        )}
        <button type="button" className="theme-toggle-btn" disabled={savingPdf} onClick={handleDownloadPdf}>
          {savingPdf ? 'PDF 저장 중…' : 'PDF 다운로드'}
        </button>
        <button type="button" className="theme-toggle-btn" disabled={savingImage} onClick={handleDownloadImage}>
          {savingImage ? '이미지 저장 중…' : '이미지 저장'}
        </button>
        <button type="button" className="theme-toggle-btn" onClick={() => setShareOpen(true)}>공유</button>
      </div>

      <div id="reportContentToExport" ref={exportRef}>
        {viewMode === 'detail' ? (
          <ReportDetailContent
            report={detailReport}
            clientFilter={clientFilter}
            showClientColumn={clientFilter === 'ALL'}
            title={detailTitle}
          />
        ) : (
          <ReportSummaryContent
            title={report.title}
            profile={report.profile}
            car={report.mainCar}
            report={report}
            dash={dash}
            formatWon={formatWon}
          />
        )}
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
