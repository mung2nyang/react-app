// @ts-check
import { parseCurrencyValue } from '../../../domain/money.ts'
import { fillMessageTemplatePattern, getMessageTemplatePatterns } from '../../../data/sync/messageTemplates.ts'
import './message-template.css'
import ModalShell from '../../../shared/ui/ModalShell.jsx'
import { buildSmsHref } from '../../../domain/smsHref.ts'
import { useToast } from '../../../shared/hooks/useToast.js'

/** @typedef {import('./dayLogTypes.js').CallDetailLike} CallDetailLike */
/** @typedef {import('./dayLogTypes.js').ClientLike} ClientLike */

const TEMPLATE_TITLES = ['미수금 안내', '입금 요청', '운행 완료']

/**
 * @param {Object} props
 * @param {CallDetailLike} props.item
 * @param {ClientLike|undefined} props.client
 * @param {() => void} props.onClose
 */
export default function MessageTemplateSheet({ item, client, onClose }) {
  const showToast = useToast()
  const fare = parseCurrencyValue(item.fare).toLocaleString('ko-KR')
  const route = `${item.loadLoc || '상차지'} → ${item.unloadLoc || '하차지'}`
  const company = item.client || '거래처'
  const templates = getMessageTemplatePatterns().map((pattern, index) => ({
    title: TEMPLATE_TITLES[index],
    body: fillMessageTemplatePattern(pattern, { company, route, fare }),
  }))

  /** @param {string} body */
  function send(body) {
    const phone = client?.phone || ''
    if (!phone) {
      showToast?.('거래처에 등록된 연락처가 없습니다.')
      return
    }
    window.location.assign(buildSmsHref(phone, body, navigator.userAgent))
    onClose()
  }

  return (
    <ModalShell onClose={onClose} overlayClassName="message-template-overlay" contentClassName="message-template-sheet" label="문자 양식 선택">
        <div className="message-template-head">
          <div>
            <strong>문자 보내기</strong>
            <span>{company}{client?.phone ? `, ${client.phone}` : ''}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <p className="message-template-help">보낼 양식을 선택하면 문자 앱에서 내용을 확인하고 수정할 수 있습니다.</p>
        <div className="message-template-list">
          {templates.map((template) => (
            <button type="button" key={template.title} onClick={() => send(template.body)}>
              <strong>{template.title}</strong>
              <span>{template.body}</span>
            </button>
          ))}
        </div>
    </ModalShell>
  )
}
