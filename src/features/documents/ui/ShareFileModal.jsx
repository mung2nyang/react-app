// @ts-check
// 파일 보내기 공용 창 — 카카오톡(파일+문구 공유)·문자(파일 저장 뒤 문자 앱) × PDF·이미지. 운송비 내역서·일상점검표가 같이 쓴다.
import './report.css'
import ModalShell from '../../../shared/ui/ModalShell.jsx'
import { buildSmsHref } from '../../../domain/smsHref.js'

/** @param {'pdf'|'image'} type */
const formatLabel = (type) => (type === 'image' ? '이미지' : 'PDF')

/**
 * @param {Object} props
 * @param {string} props.title 창 제목
 * @param {string} props.kakaoHint
 * @param {string} props.smsHint
 * @param {string} props.shareTitle 공유 제목
 * @param {string} props.kakaoText 카카오톡에 함께 보낼 문구
 * @param {string} props.unsupportedToast 공유를 못 하는 휴대폰 안내
 * @param {string} props.logLabel 오류 기록 이름
 * @param {(type: 'pdf'|'image') => Promise<File>} props.buildFile
 * @param {() => { phone: string, message: string } | string} props.smsTarget 받는 사람·문구, 못 보내면 안내 문구
 * @param {() => void} props.onClose
 * @param {(message: string) => void} [props.showToast]
 */
export default function ShareFileModal({
  title, kakaoHint, smsHint, shareTitle, kakaoText, unsupportedToast, logLabel, buildFile, smsTarget, onClose, showToast,
}) {
  /** @param {'pdf'|'image'} type */
  async function shareToKakao(type) {
    onClose()
    try {
      showToast?.(`카카오톡으로 보낼 ${formatLabel(type)}를 준비하고 있습니다.`)
      const file = await buildFile(type)
      const nav = /** @type {Navigator & { canShare?: (data: { files: Array<File> }) => boolean }} */ (navigator)
      if (!nav.share || (nav.canShare && !nav.canShare({ files: [file] }))) {
        showToast?.(unsupportedToast)
        return
      }
      await nav.share({ files: [file], title: shareTitle, text: kakaoText })
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error(`카카오톡 ${logLabel} 공유 실패:`, error)
        showToast?.('카카오톡 파일 공유에 실패했습니다.')
      }
    }
  }

  /** @param {'pdf'|'image'} type */
  async function shareBySms(type) {
    const target = smsTarget()
    if (typeof target === 'string') {
      showToast?.(target)
      return
    }
    onClose()
    let fileUrl = ''
    try {
      showToast?.(`문자로 보낼 ${formatLabel(type)}를 저장하고 있습니다.`)
      const file = await buildFile(type)
      fileUrl = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.download = file.name
      link.href = fileUrl
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.location.href = buildSmsHref(target.phone, target.message, navigator.userAgent)
    } catch (error) {
      console.error(`문자용 ${logLabel} 저장 실패:`, error)
      showToast?.('문자용 파일 저장에 실패했습니다.')
    } finally {
      if (fileUrl) setTimeout(() => URL.revokeObjectURL(fileUrl), 1000)
    }
  }

  return (
    <ModalShell onClose={onClose} contentClassName="modal-content report-share-content" label={title}>
      <div className="report-share-head">
        <strong>{title}</strong>
        <p>보내는 방법이나 파일 형식을 선택해 주세요.</p>
      </div>
      <div className="report-share-options">
        <section className="report-share-channel">
          <div className="report-share-channel-title">
            <span className="report-share-file-icon kakao">톡</span>
            <span><strong>카카오톡으로 보내기</strong><small>{kakaoHint}</small></span>
          </div>
          <div className="report-share-format-buttons">
            <button type="button" onClick={() => shareToKakao('pdf')}><strong>PDF로 보내기</strong></button>
            <button type="button" onClick={() => shareToKakao('image')}><strong>이미지로 보내기</strong></button>
          </div>
        </section>
        <section className="report-share-channel">
          <div className="report-share-channel-title">
            <span className="report-share-file-icon sms">문자</span>
            <span><strong>문자로 보내기</strong><small>{smsHint}</small></span>
          </div>
          <div className="report-share-format-buttons">
            <button type="button" onClick={() => shareBySms('pdf')}><strong>PDF로 보내기</strong></button>
            <button type="button" onClick={() => shareBySms('image')}><strong>이미지로 보내기</strong></button>
          </div>
        </section>
      </div>
    </ModalShell>
  )
}
