// @ts-check
import { useState } from 'react'
import {
  getDefaultMessageTemplatePatterns,
  getDefaultReportShareMessagePattern,
  getMessageTemplatePatterns,
  getReportShareMessagePattern,
  resetMessageTemplateSettings,
  saveMessageTemplateSettings,
} from '../../../data/sync/messageTemplates.ts'
import PageHeader from '../../../shared/ui/PageHeader.jsx'
import FieldError, { focusField, invalidProps } from '../../../shared/ui/FieldError.jsx'
import './message-settings.css'
import { useToast } from '../../../shared/hooks/useToast.js'

/**
 * @param {Object} props
 * @param {() => void} [props.onBack]
 */
export default function MessageSettingsPage({ onBack }) {
  const showToast = useToast()
  const initial = getMessageTemplatePatterns()
  const [unpaid, setUnpaid] = useState(initial[0])
  const [paymentRequest, setPaymentRequest] = useState(initial[1])
  const [tripComplete, setTripComplete] = useState(initial[2])
  const [reportShare, setReportShare] = useState(getReportShareMessagePattern())
  const [problemId, setProblemId] = useState('')
  const values = { msgUnpaid: unpaid, msgPaymentRequest: paymentRequest, msgTripComplete: tripComplete, msgReportShare: reportShare }
  // 위에서부터 첫 빈 칸 하나. 그 칸을 채우면 표시를 거둔다.
  const emptyId = Object.keys(values).find((id) => !values[/** @type {keyof typeof values} */ (id)].trim()) || ''
  const shown = problemId && problemId === emptyId ? { field: problemId, message: '문구를 입력해 주세요.' } : null

  function handleSave() {
    const unpaidMessage = unpaid.trim()
    const paymentRequestMessage = paymentRequest.trim()
    const tripCompleteMessage = tripComplete.trim()
    const reportMessage = reportShare.trim()

    setProblemId(emptyId)
    if (emptyId) {
      focusField(emptyId)
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
      <PageHeader title="문자 문구 설정" onBack={onBack} />

      <section className="message-settings-section">
        <div className="message-settings-heading">
          <h3>미수금 안내 문자</h3>
          <p>운행일지의 미수금 문자 보내기에 사용됩니다.</p>
        </div>
        <textarea className="message-settings-textarea" maxLength={500} aria-label="미수금 안내 문자 문구" id="msgUnpaid" value={unpaid} onChange={(e) => setUnpaid(e.target.value)} {...invalidProps(shown, 'msgUnpaid', 'msgUnpaid')} />
        <FieldError problem={shown} field="msgUnpaid" inputId="msgUnpaid" />
        <p className="message-settings-variables"><b>자동으로 입력되는 항목:</b> {'{거래처}, {운행구간}, {운송료}'}</p>
      </section>

      <section className="message-settings-section">
        <div className="message-settings-heading">
          <h3>입금 요청 문자</h3>
          <p>운행일지의 입금 요청 문자 보내기에 사용됩니다.</p>
        </div>
        <textarea className="message-settings-textarea" maxLength={500} aria-label="입금 요청 문자 문구" id="msgPaymentRequest" value={paymentRequest} onChange={(e) => setPaymentRequest(e.target.value)} {...invalidProps(shown, 'msgPaymentRequest', 'msgPaymentRequest')} />
        <FieldError problem={shown} field="msgPaymentRequest" inputId="msgPaymentRequest" />
        <p className="message-settings-variables"><b>자동으로 입력되는 항목:</b> {'{거래처}, {운행구간}, {운송료}'}</p>
      </section>

      <section className="message-settings-section">
        <div className="message-settings-heading">
          <h3>운행 완료 문자</h3>
          <p>운행일지의 운행 완료 문자 보내기에 사용됩니다.</p>
        </div>
        <textarea className="message-settings-textarea" maxLength={500} aria-label="운행 완료 문자 문구" id="msgTripComplete" value={tripComplete} onChange={(e) => setTripComplete(e.target.value)} {...invalidProps(shown, 'msgTripComplete', 'msgTripComplete')} />
        <FieldError problem={shown} field="msgTripComplete" inputId="msgTripComplete" />
        <p className="message-settings-variables"><b>자동으로 입력되는 항목:</b> {'{거래처}, {운행구간}, {운송료}'}</p>
      </section>

      <section className="message-settings-section">
        <div className="message-settings-heading">
          <h3>운송비 내역서 공유 문구</h3>
          <p>카카오톡과 문자 공유에 함께 포함됩니다.</p>
        </div>
        <textarea className="message-settings-textarea" maxLength={500} aria-label="운송비 내역서 공유 문구" id="msgReportShare" value={reportShare} onChange={(e) => setReportShare(e.target.value)} {...invalidProps(shown, 'msgReportShare', 'msgReportShare')} />
        <FieldError problem={shown} field="msgReportShare" inputId="msgReportShare" />
        <p className="message-settings-variables"><b>자동으로 입력되는 항목:</b> {'{거래처}'}</p>
      </section>

      <div className="message-settings-actions">
        <button type="button" className="message-settings-reset" onClick={handleReset}>기본 문구로 복원</button>
        <button type="button" className="message-settings-save" onClick={handleSave}>저장</button>
      </div>
    </div>
  )
}
