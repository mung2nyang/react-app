// @ts-check
import { parseCurrencyValue } from '../../domain/money.js'
import { commissionInfo, durationSuffix, formatCallTime } from './callDetailFormHelpers.js'
import { EditIcon, DeleteIcon, PhoneIcon, MessageIcon } from './icons.jsx'

/** @typedef {import('./dayLogTypes.js').CallDetailLike} CallDetailLike */
/** @typedef {import('./dayLogTypes.js').ClientLike} ClientLike */
/** @typedef {import('./dayLogTypes.js').PaymentSummary} PaymentSummary */
/** @typedef {import('./dayLogTypes.js').Settings} Settings */

/**
 * @param {Object} props
 * @param {CallDetailLike} props.item 콜상세 한 건(항상 id를 가진다 — domain/day-record.js의 getCallDetails 참고)
 * @param {PaymentSummary} props.payment
 * @param {Settings} props.settings
 * @param {ClientLike|undefined} props.client
 * @param {() => void} props.onEdit
 * @param {() => void} props.onDelete
 * @param {() => void} props.onTogglePayment
 * @param {() => void} props.onMessage
 */
export default function CallDetailCard({ item, payment, settings, client, onEdit, onDelete, onTogglePayment, onMessage }) {
  const fare = parseCurrencyValue(item.fare)
  const unpaid = payment.status !== 'paid'
  const distance = parseFloat(item.distanceKm || '') || 0
  const specs = [
    settings.distanceOn && distance ? `운행거리:${distance}km` : '',
    settings.cargoTonnageOn && item.cargoTonnage ? `${item.cargoTonnage}톤` : '',
  ].filter(Boolean).join('　')
  const commission = commissionInfo(item)

  return (
    <article className={`call-detail-card${unpaid ? ' unpaid-card' : ''}`}>
      <div className="call-detail-card-head">
        <div className="call-detail-route">
          <strong>{item.loadLoc || '상차지 미상'}</strong>
          <span>➜</span>
          <strong>{item.unloadLoc || '하차지 미상'}</strong>
        </div>
        <div className="call-detail-actions">
          <button type="button" className="action-icon-btn" title="수정" onClick={onEdit}><EditIcon /></button>
          <button type="button" className="action-icon-btn del" title="삭제" onClick={onDelete}><DeleteIcon /></button>
        </div>
      </div>
      {settings.timeOn && (item.departureTime || item.arrivalTime) && (
        <div className="detail-meta-line">
          출발:{formatCallTime(item.departureTime)} ➜ 도착:{formatCallTime(item.arrivalTime)}{durationSuffix(item)}
        </div>
      )}
      <div className="detail-meta-line">
        거래처: {item.client || '-'}
        {commission.label ? <span className="commission-rate">수수료 {commission.label}</span> : null}
      </div>
      {specs && <div className="detail-meta-line">{specs}</div>}
      <div className="detail-meta-line">비고:{item.remarks || '-'}</div>
      <div className="call-detail-fare-line">
        <span>운송료</span>
        <strong>{fare.toLocaleString('ko-KR')}원</strong>
      </div>
      <div className="call-detail-card-foot">
        <div className="detail-badges">
          {settings.platformOn && item.platform && <span className="detail-badge">{item.platform}</span>}
          {settings.paymentOn && item.receipt && <span className="detail-badge">{item.receipt}</span>}
        </div>
        {settings.paymentOn && (
          <div className="detail-payment-actions">
            {unpaid && (
              client?.phone
                ? <a href={`tel:${client.phone}`} className="call-phone-btn detail-call-phone" title="전화걸기" onClick={(e) => e.stopPropagation()}><PhoneIcon /></a>
                : (
                  <button
                    type="button"
                    className="call-phone-btn detail-call-phone"
                    title="연락처 없음"
                    onClick={() => window.alert('거래처에 등록된 연락처가 없습니다.')}
                  >
                    <PhoneIcon />
                  </button>
                )
            )}
            {unpaid && (
              <button type="button" className="call-phone-btn detail-message-btn" title="문자 보내기" onClick={onMessage}>
                <MessageIcon />
              </button>
            )}
            <button
              type="button"
              className={`payment-toggle-btn ${unpaid ? 'unpaid' : 'paid'}`}
              onClick={onTogglePayment}
            >
              {unpaid ? '미수' : '수금'}
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
