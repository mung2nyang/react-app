// @ts-check
// 일상점검표 탭 아래 버튼 카드(9-D, 피그마 "서류 발급" 1번): [PDF 다운로드][이미지 저장][공유] + 안내 문구.
// 내보내기는 화면 밖에 그린 법정 서식 한 장(그 달 전체)을 A4 가로 PDF·PNG로.
import { useRef, useState } from 'react'
import { inspectionFileBaseName } from '../../domain/dailyInspectionMonth.js'
import { createReportImageFile, createReportPdfFile } from '../../lib/reportExport.js'
import DailyInspectionLegalForm from './DailyInspectionLegalForm.jsx'
import DailyInspectionShareModal from './DailyInspectionShareModal.jsx'
import ConfirmModal from '../ConfirmModal.jsx'

/** @param {File} file */
function downloadFile(file) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.download = file.name
  link.href = url
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * @param {Object} props
 * @param {import('react').ComponentProps<typeof DailyInspectionLegalForm>} props.form
 * @param {boolean} props.ready 그 달 점검표를 읽었을 때만 내보내기
 * @param {(message: string) => void} [props.showToast]
 */
export default function DailyInspectionExportBar({ form, ready, showToast }) {
  const formRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const [saving, setSaving] = useState(/** @type {'pdf'|'image'|null} */ (null))
  const [shareOpen, setShareOpen] = useState(false)
  const [confirmType, setConfirmType] = useState(/** @type {'pdf'|'image'|null} */ (null))
  const baseName = inspectionFileBaseName(form.year, form.month, form.head.carNumber)

  /** @param {'pdf'|'image'} type */
  async function buildFile(type) {
    const element = formRef.current
    if (!element) throw new Error('내보낼 서식을 찾지 못했습니다.')
    return type === 'image' ? createReportImageFile(element, baseName, { orientation: 'landscape' }) : createReportPdfFile(element, baseName, { orientation: 'landscape' })
  }

  /** @param {'pdf'|'image'} type */
  async function save(type) {
    if (saving) return
    setSaving(type)
    try {
      downloadFile(await buildFile(type))
      showToast?.(type === 'pdf' ? 'PDF를 저장했습니다.' : '이미지를 저장했습니다.')
    } catch (error) {
      console.error('일상점검표 내보내기 실패:', error)
      showToast?.(type === 'pdf' ? 'PDF 저장에 실패했습니다. 다시 시도해 주세요.' : '이미지 저장에 실패했습니다.')
    } finally {
      setSaving(null)
    }
  }

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
      <p className="doc-export-notice">※ PDF,이미지 등 내보내기시 선택된 &lsquo;월&rsquo;의 전체 점검표가 &lsquo;법정 서식&rsquo;으로 저장됩니다.</p>
      {ready && (
        <div className="legal-form-offscreen" aria-hidden="true">
          <div ref={formRef}><DailyInspectionLegalForm {...form} /></div>
        </div>
      )}
      {confirmType && (
        <ConfirmModal
          title={confirmType === 'pdf' ? 'PDF 저장' : '이미지 저장'}
          message={`${confirmType === 'pdf' ? 'PDF' : '이미지'}로 저장하시겠습니까?`}
          onCancel={() => setConfirmType(null)}
          onConfirm={() => { setConfirmType(null); void save(confirmType) }}
        />
      )}
      {shareOpen && <DailyInspectionShareModal month={form.month} buildFile={buildFile} onClose={() => setShareOpen(false)} showToast={showToast} />}
    </>
  )
}
