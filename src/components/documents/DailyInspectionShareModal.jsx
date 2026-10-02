// @ts-check
// 일상점검표 보내기(9-D): 운송비 내역서 공유 창과 같은 모양 — 카카오톡(파일+안내 문구)·문자(받는 사람은 문자 앱에서 직접 고름) × PDF·이미지.
import { buildReportSmsUrl } from '../ReportShareModal.jsx'
import '../report/report.css'

/**
 * @param {Object} props
 * @param {number} props.month 0부터
 * @param {(type: 'pdf'|'image') => Promise<File>} props.buildFile
 * @param {() => void} props.onClose
 * @param {(message: string) => void} [props.showToast]
 */
export default function DailyInspectionShareModal({ month, buildFile, onClose, showToast }) {
  const message = `안녕하세요. ${month + 1}월 일상점검표입니다. 확인 부탁드립니다.`

  /** @param {'pdf'|'image'} type */
  async function shareToKakao(type) {
    onClose()
    try {
      showToast?.(`카카오톡으로 보낼 ${type === 'image' ? '이미지' : 'PDF'}를 준비하고 있습니다.`)
      const file = await buildFile(type)
      const nav = /** @type {Navigator & { canShare?: (data: { files: Array<File> }) => boolean }} */ (navigator)
      if (!nav.share || (nav.canShare && !nav.canShare({ files: [file] }))) {
        showToast?.('이 기기에서는 파일 공유를 지원하지 않습니다.')
        return
      }
      await nav.share({ files: [file], title: '일상점검표', text: message })
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('카카오톡 일상점검표 공유 실패:', error)
        showToast?.('카카오톡 파일 공유에 실패했습니다.')
      }
    }
  }

  /** @param {'pdf'|'image'} type */
  async function shareBySms(type) {
    onClose()
    let fileUrl = ''
    try {
      showToast?.(`문자로 보낼 ${type === 'image' ? '이미지' : 'PDF'}를 저장하고 있습니다.`)
      const file = await buildFile(type)
      fileUrl = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.download = file.name
      link.href = fileUrl
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.location.href = buildReportSmsUrl('', message)
    } catch (error) {
      console.error('문자용 일상점검표 저장 실패:', error)
      showToast?.('문자용 파일 저장에 실패했습니다.')
    } finally {
      if (fileUrl) setTimeout(() => URL.revokeObjectURL(fileUrl), 1000)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content report-share-content" onClick={(e) => e.stopPropagation()}>
        <div className="report-share-head">
          <strong>점검표 보내기</strong>
          <p>보내는 방법이나 파일 형식을 선택해 주세요.</p>
        </div>
        <div className="report-share-options">
          <section className="report-share-channel">
            <div className="report-share-channel-title">
              <span className="report-share-file-icon kakao">톡</span>
              <span><strong>카카오톡으로 보내기</strong><small>파일과 안내 문구를 함께 공유합니다.</small></span>
            </div>
            <div className="report-share-format-buttons">
              <button type="button" onClick={() => shareToKakao('pdf')}><strong>PDF로 보내기</strong></button>
              <button type="button" onClick={() => shareToKakao('image')}><strong>이미지로 보내기</strong></button>
            </div>
          </section>
          <section className="report-share-channel">
            <div className="report-share-channel-title">
              <span className="report-share-file-icon sms">문자</span>
              <span><strong>문자로 보내기</strong><small>파일을 저장하고 안내 문구로 문자 앱을 엽니다. 받는 사람은 직접 골라 주세요.</small></span>
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
