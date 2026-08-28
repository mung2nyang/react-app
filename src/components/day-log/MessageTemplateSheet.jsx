// @ts-check
import { parseCurrencyValue } from '../../domain/money.js'

/** @typedef {import('./dayLogTypes.js').CallDetailLike} CallDetailLike */
/** @typedef {import('./dayLogTypes.js').ClientLike} ClientLike */

/**
 * @param {CallDetailLike} item 콜상세
 * @param {string} phone
 */
function buildUnpaidSmsUrl(item, phone) {
  const fare = parseCurrencyValue(item.fare).toLocaleString('ko-KR')
  const route = `${item.loadLoc || '상차지'} → ${item.unloadLoc || '하차지'}`
  const body = `안녕하세요, ${item.client || '거래처'} 담당자님. ${route} 운송료 ${fare}원이 미수 상태입니다. 확인 부탁드립니다.`
  const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?'
  return `sms:${phone}${separator}body=${encodeURIComponent(body)}`
}

/**
 * @param {Object} props
 * @param {CallDetailLike} props.item
 * @param {ClientLike|undefined} props.client
 * @param {() => void} props.onClose
 */
export default function MessageTemplateSheet({ item, client, onClose }) {
  function send() {
    const phone = client?.phone || ''
    if (!phone) {
      window.alert('거래처에 등록된 연락처가 없습니다.')
      return
    }
    window.location.href = buildUnpaidSmsUrl(item, phone)
    onClose()
  }

  return (
    <div className="message-template-overlay" onClick={onClose}>
      <section className="message-template-sheet" role="dialog" aria-modal="true" aria-label="문자 양식 선택" onClick={(e) => e.stopPropagation()}>
        <div className="message-template-head">
          <div>
            <strong>문자 보내기</strong>
            <span>{item.client || '거래처'}{client?.phone ? ` · ${client.phone}` : ''}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <p className="message-template-help">보낼 양식을 선택하면 문자 앱에서 내용을 확인하고 수정할 수 있습니다.</p>
        <div className="message-template-list">
          <button type="button" onClick={send}>
            <strong>미수금 안내</strong>
            <span>선택한 거래처로 미수 안내 문자를 보냅니다.</span>
          </button>
        </div>
      </section>
    </div>
  )
}
