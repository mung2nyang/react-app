// @ts-check
import {
  buildDetailReportFileName,
  buildReportFileName,
  getDetailReportClientContact,
  getReportShareCompanyName,
} from '../lib/report.js'
import { fillReportShareMessagePattern, getReportShareMessagePattern } from '../lib/messageTemplates.js'
import { createReportImageFile, createReportPdfFile } from '../lib/reportExport.js'

/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */

/**
 * @param {string} phone
 * @param {string} body
 */
export function buildReportSmsUrl(phone, body) {
  const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?'
  return `sms:${phone}${separator}body=${encodeURIComponent(body)}`
}

/**
 * @param {Object} props
 * @param {{ current: HTMLElement | null }} props.exportRef
 * @param {'summary'|'detail'} props.viewMode
 * @param {string} props.clientFilter
 * @param {Array<ClientLike>|null|undefined} props.clients
 * @param {number} props.year
 * @param {number} props.month 0-based
 * @param {() => void} props.onClose
 * @param {(message: string) => void} [props.showToast]
 */
export default function ReportShareModal({ exportRef, viewMode, clientFilter, clients, year, month, onClose, showToast }) {
  const baseFileName = (viewMode === 'detail'
    ? buildDetailReportFileName(year, month, clientFilter)
    : buildReportFileName(year, month)).replace(/\.pdf$/, '')
  const companyName = getReportShareCompanyName(viewMode, clientFilter)
  const contact = getDetailReportClientContact(viewMode, clientFilter, clients)

  /** @param {'pdf'|'image'} type */
  async function buildFile(type) {
    const element = exportRef.current
    if (!element) throw new Error('내보낼 화면을 찾지 못했습니다.')
    document.body.classList.add('pdf-export-mode')
    try {
      return type === 'image' ? await createReportImageFile(element, baseFileName) : await createReportPdfFile(element, baseFileName)
    } finally {
      document.body.classList.remove('pdf-export-mode')
    }
  }

  /** @param {'pdf'|'image'} type */
  async function shareToKakao(type) {
    onClose()
    try {
      const formatLabel = type === 'image' ? '이미지' : 'PDF'
      showToast?.(`카카오톡으로 보낼 ${formatLabel}를 준비하고 있습니다.`)
      const file = await buildFile(type)
      const nav = /** @type {Navigator & { canShare?: (data: { files: Array<File> }) => boolean }} */ (navigator)
      if (!nav.share || (nav.canShare && !nav.canShare({ files: [file] }))) {
        showToast?.('이 기기에서는 파일 공유를 지원하지 않습니다.')
        return
      }
      await nav.share({
        files: [file],
        title: '운송비 내역서',
        text: fillReportShareMessagePattern(getReportShareMessagePattern(), companyName),
      })
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('카카오톡 내역서 공유 실패:', error)
        showToast?.('카카오톡 파일 공유에 실패했습니다.')
      }
    }
  }

  /** @param {'pdf'|'image'} type */
  async function shareBySms(type) {
    if (!contact) {
      window.alert('특정 거래처의 상세내역을 조회하고, 거래처 연락처가 등록되어 있는지 확인해 주세요.')
      return
    }
    onClose()
    let fileUrl = ''
    try {
      const formatLabel = type === 'image' ? '이미지' : 'PDF'
      showToast?.(`문자로 보낼 ${formatLabel}를 저장하고 있습니다.`)
      const file = await buildFile(type)
      fileUrl = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.download = file.name
      link.href = fileUrl
      document.body.appendChild(link)
      link.click()
      link.remove()
      const message = fillReportShareMessagePattern(getReportShareMessagePattern(), contact.name)
      window.location.href = buildReportSmsUrl(contact.phone, message)
    } catch (error) {
      console.error('문자용 내역서 저장 실패:', error)
      showToast?.('문자용 파일 저장에 실패했습니다.')
    } finally {
      if (fileUrl) setTimeout(() => URL.revokeObjectURL(fileUrl), 1000)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content report-share-content" onClick={(e) => e.stopPropagation()}>
        <div className="report-share-head">
          <strong>내역서 보내기</strong>
          <p>보내는 방법이나 파일 형식을 선택해 주세요.</p>
        </div>
        <div className="report-share-options">
          <section className="report-share-channel">
            <div className="report-share-channel-title">
              <span className="report-share-file-icon kakao">톡</span>
              <span><strong>카카오톡으로 보내기</strong><small>파일과 설정한 안내 문구를 함께 공유합니다.</small></span>
            </div>
            <div className="report-share-format-buttons">
              <button type="button" onClick={() => shareToKakao('pdf')}><strong>PDF로 보내기</strong></button>
              <button type="button" onClick={() => shareToKakao('image')}><strong>이미지로 보내기</strong></button>
            </div>
          </section>
          <section className="report-share-channel">
            <div className="report-share-channel-title">
              <span className="report-share-file-icon sms">문자</span>
              <span><strong>문자로 보내기</strong><small>설정한 안내 문구를 포함해 문자 앱을 엽니다.</small></span>
            </div>
            <div className="report-share-format-buttons">
              <button type="button" onClick={() => shareBySms('pdf')}><strong>PDF로 보내기</strong></button>
              <button type="button" onClick={() => shareBySms('image')}><strong>이미지로 보내기</strong></button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
