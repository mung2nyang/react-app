// @ts-check
import {
  buildDetailReportFileName,
  buildReportFileName,
  getDetailReportClientContact,
  getReportShareCompanyName,
} from '../lib/report.js'
import { fillReportShareMessagePattern, getReportShareMessagePattern } from '../lib/messageTemplates.js'
import { createReportImageFile, createReportPdfFile } from '../lib/reportExport.js'
import ShareFileModal, { buildShareSmsUrl } from './shared/ShareFileModal.jsx'

/** @typedef {import('../domain/clientTypes.js').ClientLike} ClientLike */

export const buildReportSmsUrl = buildShareSmsUrl

const NO_CONTACT = '문자로 보내려면 [세부 내역]에서 거래처를 하나 고르고, 그 거래처에 연락처가 있는지 확인해 주세요.'

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
    if (!element) throw new Error('내역서를 만들지 못했습니다. 창을 닫았다가 다시 시도해 주세요.')
    document.body.classList.add('pdf-export-mode')
    try {
      return type === 'image' ? await createReportImageFile(element, baseFileName) : await createReportPdfFile(element, baseFileName)
    } finally {
      document.body.classList.remove('pdf-export-mode')
    }
  }

  return (
    <ShareFileModal
      title="내역서 보내기"
      kakaoHint="파일과 설정한 안내 문구를 함께 공유합니다."
      smsHint="설정한 안내 문구를 포함해 문자 앱을 엽니다."
      shareTitle="운송비 내역서"
      kakaoText={fillReportShareMessagePattern(getReportShareMessagePattern(), companyName)}
      unsupportedToast="이 휴대폰에서는 파일 공유를 할 수 없습니다. [PDF 다운로드]로 저장한 뒤 보내 주세요."
      logLabel="내역서"
      buildFile={buildFile}
      smsTarget={() => (contact
        ? { phone: contact.phone, message: fillReportShareMessagePattern(getReportShareMessagePattern(), contact.name) }
        : NO_CONTACT)}
      onClose={onClose}
      showToast={showToast}
    />
  )
}
