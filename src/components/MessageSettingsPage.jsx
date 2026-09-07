// @ts-check
import { useState } from 'react'
import {
  getDefaultMessageTemplatePatterns,
  getDefaultReportShareMessagePattern,
  getMessageTemplatePatterns,
  getReportShareMessagePattern,
  resetMessageTemplateSettings,
  saveMessageTemplateSettings,
} from '../lib/messageTemplates.js'

/**
 * @param {Object} props
 * @param {() => void} [props.onBack]
 * @param {(message: string) => void} [props.showToast]
 */
export default function MessageSettingsPage({ onBack, showToast }) {
  const initial = getMessageTemplatePatterns()
  const [unpaid, setUnpaid] = useState(initial[0])
  const [paymentRequest, setPaymentRequest] = useState(initial[1])
  const [tripComplete, setTripComplete] = useState(initial[2])
  const [reportShare, setReportShare] = useState(getReportShareMessagePattern())

  function handleSave() {
    const unpaidMessage = unpaid.trim()
    const paymentRequestMessage = paymentRequest.trim()
    const tripCompleteMessage = tripComplete.trim()
    const reportMessage = reportShare.trim()

    if (!unpaidMessage || !paymentRequestMessage || !tripCompleteMessage || !reportMessage) {
      showToast?.('모든 문자 문구를 입력해 주세요.')
      return
    }

    try {
      saveMessageTemplateSettings([unpaidMessage, paymentRequestMessage, tripCompleteMessage], reportMessage)
      showToast?.('문자 문구를 저장했습니다.')
    } catch (error) {
      console.error('문자 문구 저장 실패:', error)
      showToast?.('문자 문구를 저장하지 못했습니다.')
    }
  }

  function handleReset() {
    try {
      resetMessageTemplateSettings()
    } catch (error) {
      console.error('기본 문자 문구 복원 실패:', error)
      showToast?.('기본 문구를 복원하지 못했습니다.')
      return
    }
    const defaults = getDefaultMessageTemplatePatterns()
    setUnpaid(defaults[0])
    setPaymentRequest(defaults[1])
    setTripComplete(defaults[2])
    setReportShare(getDefaultReportShareMessagePattern())
    showToast?.('기본 문구로 복원했습니다.')
  }

  return (
    <div className="page message-settings-page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">문자 문구 설정</div>
        <div style={{ width: 40 }}></div>
      </div>

      <section className="message-settings-section">
        <div className="message-settings-heading">
          <h3>미수금 안내 문자</h3>
          <p>운행일지의 미수금 문자보내기에 사용됩니다.</p>
        </div>
        <textarea className="message-settings-textarea" maxLength={500} aria-label="미수금 안내 문자 문구" value={unpaid} onChange={(e) => setUnpaid(e.target.value)} />
        <p className="message-settings-variables"><b>자동 입력:</b> {'{거래처} · {운행구간} · {운송료}'}</p>
      </section>

      <section className="message-settings-section">
        <div className="message-settings-heading">
          <h3>입금 요청 문자</h3>
          <p>운행일지의 입금 요청 문자보내기에 사용됩니다.</p>
        </div>
        <textarea className="message-settings-textarea" maxLength={500} aria-label="입금 요청 문자 문구" value={paymentRequest} onChange={(e) => setPaymentRequest(e.target.value)} />
        <p className="message-settings-variables"><b>자동 입력:</b> {'{거래처} · {운행구간} · {운송료}'}</p>
      </section>

      <section className="message-settings-section">
        <div className="message-settings-heading">
          <h3>운행 완료 문자</h3>
          <p>운행일지의 운행 완료 문자보내기에 사용됩니다.</p>
        </div>
        <textarea className="message-settings-textarea" maxLength={500} aria-label="운행 완료 문자 문구" value={tripComplete} onChange={(e) => setTripComplete(e.target.value)} />
        <p className="message-settings-variables"><b>자동 입력:</b> {'{거래처} · {운행구간} · {운송료}'}</p>
      </section>

      <section className="message-settings-section">
        <div className="message-settings-heading">
          <h3>운송비 내역서 공유 문구</h3>
          <p>카카오톡과 문자 공유에 함께 포함됩니다.</p>
        </div>
        <textarea className="message-settings-textarea" maxLength={500} aria-label="운송비 내역서 공유 문구" value={reportShare} onChange={(e) => setReportShare(e.target.value)} />
        <p className="message-settings-variables"><b>자동 입력:</b> {'{거래처}'}</p>
      </section>

      <div className="message-settings-actions">
        <button type="button" className="message-settings-reset" onClick={handleReset}>기본 문구로 복원</button>
        <button type="button" className="message-settings-save" onClick={handleSave}>저장</button>
      </div>
    </div>
  )
}
