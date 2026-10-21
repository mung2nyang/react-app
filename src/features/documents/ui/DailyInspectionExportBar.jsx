// @ts-check
// 일상점검표 탭 아래 버튼 카드(9-D, 피그마 "서류 발급" 1번): [PDF 다운로드][이미지 저장][공유] + 안내 문구.
// 내보내기는 화면 밖에 그린 법정 서식 한 장(그 달 전체)을 A4 가로 PDF·PNG로.
import { useRef, useState } from 'react'
import { inspectionFileBaseName } from '../../../domain/dailyInspectionMonth.js'
import { createReportImageFile, createReportPdfFile } from '../api/reportExport.js'
import DailyInspectionLegalForm from './DailyInspectionLegalForm.jsx'
import DailyInspectionShareModal from './DailyInspectionShareModal.jsx'
import ConfirmModal from '../../../shared/ui/ConfirmModal.jsx'
import useFileDownload from '../hooks/useFileDownload.js'

/**
 * @param {Object} props
 * @param {import('react').ComponentProps<typeof DailyInspectionLegalForm>} props.form
 * @param {boolean} props.ready 그 달 점검표를 읽었을 때만 내보내기
 */
export default function DailyInspectionExportBar({ form, ready }) {
  const formRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const [shareOpen, setShareOpen] = useState(false)
  const [confirmType, setConfirmType] = useState(/** @type {'pdf'|'image'|null} */ (null))
  const baseName = inspectionFileBaseName(form.year, form.month, form.head.carNumber)

  /** @param {'pdf'|'image'} type */
  async function buildFile(type) {
    const element = formRef.current
    if (!element) throw new Error('점검표를 만들지 못했습니다. 창을 닫았다가 다시 시도해 주세요.')
    return type === 'image' ? createReportImageFile(element, baseName, { orientation: 'landscape' }) : createReportPdfFile(element, baseName, { orientation: 'landscape' })
  }

  const { saving, download } = useFileDownload(buildFile, '일상점검표')

  return (
    <>
      <div className="doc-action-card">
        <div className="report-pdf-actions">
          <button type="button" className="theme-toggle-btn" disabled={!ready || saving !== null} onClick={() => setConfirmType('pdf')}>
            {saving === 'pdf' ? 'PDF 저장 중…' : 'PDF 다운로드'}
          </button>
          <button type="button" className="theme-toggle-btn" disabled={!ready || saving !== null} onClick={() => setConfirmType('image')}>
            {saving === 'image' ? '이미지 저장 중…' : '이미지 저장'}
          </button>
          <button type="button" className="theme-toggle-btn" disabled={!ready} onClick={() => setShareOpen(true)}>공유</button>
        </div>
      </div>
      <p className="doc-export-notice">※ PDF나 이미지로 내보내면 선택한 달의 전체 점검표가 법정 서식으로 저장됩니다.</p>
      {ready && (
        <div className="legal-form-offscreen" aria-hidden="true">
          <div ref={formRef}><DailyInspectionLegalForm {...form} /></div>
        </div>
      )}
      {confirmType && (
        <ConfirmModal
          title={confirmType === 'pdf' ? 'PDF 저장' : '이미지 저장'}
          message={`${confirmType === 'pdf' ? 'PDF' : '이미지'}로 저장하시겠습니까?`}
          confirmLabel="저장"
          onCancel={() => setConfirmType(null)}
          onConfirm={() => { setConfirmType(null); void download(confirmType) }}
        />
      )}
      {shareOpen && <DailyInspectionShareModal month={form.month} buildFile={buildFile} onClose={() => setShareOpen(false)} />}
    </>
  )
}
