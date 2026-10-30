// @ts-check
// 운송비 내역서 화면(요약·세부 보기) — 내려받기는 useFileDownload, 공유는 ReportShareModal, 보는 달은 서류 발급이 줌.
import { useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { formatWon } from '../../../domain/money.ts'
import { resolveLogSettings } from '../../../domain/carSettingsScope.ts'
import { dash, reportBaseFileName } from '../api/report.js'
import { buildReportExportFile } from '../api/reportExport.js'
import useFileDownload from '../hooks/useFileDownload.js'
import { buildDetailReport, detailReportClientOptions } from '../api/reportDetail.js'
import { buildMonthReport } from '../api/reportSummary.js'
import { useOwnerCars, useOwnerClients, useOwnerExpenses, useOwnerProfile, useOwnerSettings, useOwnerWorkDataByLogId } from '../../../data/store/ownerDataHooks.ts'
import MonthNavigator from '../../../shared/ui/MonthNavigator.jsx'
import ReportDetailContent, { ReportClientPickerModal } from './ReportDetailView.jsx'
import { ReportSummaryContent } from './ReportSummaryContent.jsx'
import ReportShareModal from './ReportShareModal.jsx'
import ConfirmModal from '../../../shared/ui/ConfirmModal.jsx'
import PageHeader from '../../../shared/ui/PageHeader.jsx'
import './report.css'
import { useToast } from '../../../shared/hooks/useToast.js'
import { useSession } from '../../../data/cloud/sessionContext.ts'

const EMPTY_WORK = /** @type {Record<string, never>} */ ({})

/**
 * @param {Object} props
 * @param {string} [props.logId] 특정 차량(연동기사 배정차량·미연동 서브차량)으로 스코프. 없으면 메인 차량.
 * @param {() => void} [props.onBack]
 * @param {(() => void)} [props.onOpenMenu]
 * @param {import('react').ReactNode} [props.tabs] 서류 발급 탭 줄 — 위 카드 달 이동 아래에 끼움
 * @param {Date} props.viewDate
 * @param {(next: Date) => void} props.onChangeMonth
 */
export default function ReportPage({ logId: logIdProp, onBack, onOpenMenu, tabs, viewDate, onChangeMonth }) {
  const { ownerKey } = useSession()
  const showToast = useToast()
  const { logId: rawLogId } = useParams()
  const logKey = (logIdProp ?? (rawLogId ? decodeURIComponent(rawLogId) : undefined)) || 'main'
  const [shareOpen, setShareOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [confirmType, setConfirmType] = useState(/** @type {'pdf'|'image'|null} */ (null))
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
  const workData = workByLogId[logKey] || EMPTY_WORK
  const clients = useOwnerClients(ownerKey)
  const storedProfile = useOwnerProfile(ownerKey)
  const report = useMemo(
    () => buildMonthReport(ownerKey, year, month, expenses, cars, practiceSettings, workData, clients, storedProfile, logKey),
    [ownerKey, year, month, expenses, cars, practiceSettings, workData, clients, storedProfile, logKey],
  )
  const clientOptions = useMemo(
    () => detailReportClientOptions(workData, year, month, clients),
    [workData, year, month, clients],
  )
  const detailReport = useMemo(
    () => buildDetailReport(workData, year, month, clientFilter, { clients }),
    [workData, year, month, clientFilter, clients],
  )

  /** @param {'pdf'|'image'} type */
  async function buildFile(type) {
    const element = exportRef.current
    if (!element) throw new Error('내역서를 만들지 못했습니다. 창을 닫았다가 다시 시도해 주세요.')
    return buildReportExportFile(element, type, reportBaseFileName(viewMode, year, month, clientFilter))
  }

  const { saving, download } = useFileDownload(buildFile, '운송비 내역서')

  // [공유] 파일도 내려받기와 같은 내보내기 모양(날짜 표 두 줄)으로 만든다.
  /** @param {'pdf'|'image'} type */
  async function buildShareFile(type) {
    setSharing(true)
    try {
      return await buildFile(type)
    } finally {
      setSharing(false)
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
    showToast?.('세부 내역서를 불러왔습니다.')
  }

  return (
    <div className="page report-page-wrap">
      <PageHeader title="서류 발급" onBack={onBack} onOpenMenu={onOpenMenu} />

      <div className="report-top-card">
        <MonthNavigator viewDate={viewDate} onChange={onChangeMonth} />
        {tabs}
        <div className="doc-scope-tabs" role="tablist" aria-label="내역 범위">
          <button type="button" role="tab" aria-selected={viewMode === 'summary'} className={`doc-scope-tab${viewMode === 'summary' ? ' active' : ''}`} onClick={() => setViewMode('summary')}>전체</button>
          <button type="button" role="tab" aria-selected={viewMode === 'detail'} className={`doc-scope-tab${viewMode === 'detail' ? ' active' : ''}`} onClick={openDetailPicker}>세부 내역 (거래처 선택)</button>
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
            distanceOn={!!resolveLogSettings(practiceSettings, logKey).distanceOn}
            isExporting={saving !== null || sharing}
          />
        )}
      </div>

      <div className="doc-action-card">
        <div className="report-pdf-actions">
          <button type="button" className="theme-toggle-btn" disabled={saving !== null} onClick={() => setConfirmType('pdf')}>
            {saving === 'pdf' ? 'PDF 저장 중…' : 'PDF 다운로드'}
          </button>
          <button type="button" className="theme-toggle-btn" disabled={saving !== null} onClick={() => setConfirmType('image')}>
            {saving === 'image' ? '이미지 저장 중…' : '이미지 저장'}
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
      {confirmType && (
        <ConfirmModal
          title={confirmType === 'pdf' ? 'PDF 저장' : '이미지 저장'}
          message={`${confirmType === 'pdf' ? 'PDF' : '이미지'}로 저장하시겠습니까?`}
          confirmLabel="저장"
          onCancel={() => setConfirmType(null)}
          onConfirm={() => { setConfirmType(null); void download(confirmType) }}
        />
      )}
      {shareOpen && (
        <ReportShareModal
          buildFile={buildShareFile}
          viewMode={viewMode}
          clientFilter={clientFilter}
          clients={clients}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}
