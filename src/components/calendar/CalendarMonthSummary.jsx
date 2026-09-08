// @ts-check
// Step 5(달력 홈 재작성): MainPage.jsx의 미수금 미니 카드 + 월간 운송료 정산 카드를 옮긴다.
// 이관 계획 ③-2: monthSettlementSummary 반환값으로 거래처별·파렛트·서브수수료·지출 행 렌더.
import { formatWon } from '../../domain/money.js'

/**
 * @typedef {ReturnType<typeof import('../../domain/monthSettlement.js').monthSettlementSummary>} MonthSettlementSummary
 */

/**
 * @param {Object} props
 * @param {boolean} props.paymentOn
 * @param {number} props.unpaidTotal
 * @param {MonthSettlementSummary} props.summary
 * @param {boolean} [props.distanceOn]
 */
export default function CalendarMonthSummary({ paymentOn, unpaidTotal, summary, distanceOn = false }) {
  const clientNames = Object.keys(summary.fareByClient || {})
  return (
    <>
      {paymentOn && unpaidTotal > 0 && (
        <div className="unpaid-summary-card">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          이번 달 총 {unpaidTotal.toLocaleString()}원의 미수금이 있습니다.
        </div>
      )}

      <div className="summary-card">
        <div className="summary-title">
          <span>월간 운송료 정산</span>
          <span>총 {summary.trips + summary.callTrips}회 운행</span>
        </div>

        {distanceOn && summary.distanceKm > 0 && (
          <div className="summary-row">
            <span>실 운행거리</span>
            <span className="summary-value">{summary.distanceKm} km</span>
          </div>
        )}

        {summary.fixedBaseFare > 0 && (
          <div className="summary-row">
            <span>고정 기본 운송료</span>
            <span className="summary-value">{formatWon(summary.fixedBaseFare)}</span>
          </div>
        )}
        {summary.defaultBaseFare > 0 && (
          <div className="summary-row">
            <span>미지정 거래처 운송료</span>
            <span className="summary-value">{formatWon(summary.defaultBaseFare)}</span>
          </div>
        )}
        {clientNames.map((client) => (
          <div key={client}>
            <div className="summary-row">
              <span>{client} 기본 운송료</span>
              <span className="summary-value">{formatWon(summary.fareByClient[client])}</span>
            </div>
            {(summary.commissionByClient[client] || 0) > 0 && (
              <div className="summary-row summary-client-commission-row">
                <span className="summary-client-commission-label">
                  {client} 수수료 ({summary.commissionLabelByClient[client]})
                </span>
                <span className="summary-value">- {formatWon(summary.commissionByClient[client])}</span>
              </div>
            )}
          </div>
        ))}

        {summary.subCarComm > 0 && (
          <div className="summary-row">
            <span>{summary.subCarCommLabel}</span>
            <span className="summary-value">- {formatWon(summary.subCarComm)}</span>
          </div>
        )}
        {summary.palletFare > 0 && (
          <div className="summary-row">
            <span>파렛트 회수 청구액</span>
            <span className="summary-value">{formatWon(summary.palletFare)}</span>
          </div>
        )}

        <div className="summary-row">
          <span>부가세 (공급가액 기준 10%)</span>
          <span className="summary-value">{formatWon(summary.vat)}</span>
        </div>
        <div className="summary-row total">
          <span>합계</span>
          <span className="summary-value">{formatWon(summary.total)}</span>
        </div>

        {summary.maint > 0 && (
          <div
            className="summary-row"
            style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border-color)' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg className="inline-icon sm" viewBox="0 0 24 24">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
              </svg>
              차량 정비비
            </span>
            <span className="summary-value">{formatWon(summary.maint)}</span>
          </div>
        )}
        {summary.fuel > 0 && (
          <div className="summary-row" style={{ color: 'var(--primary-color)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg className="inline-icon sm" viewBox="0 0 24 24" aria-hidden="true">
                <line x1="3" x2="15" y1="22" y2="22"></line>
                <line x1="4" x2="14" y1="9" y2="9"></line>
                <path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"></path>
                <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5"></path>
              </svg>
              차량 주유비
            </span>
            <span className="summary-value">{formatWon(summary.fuel)}</span>
          </div>
        )}
        {summary.misc > 0 && (
          <div className="summary-row" style={{ color: 'var(--sunday-color)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg className="inline-icon sm" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 6h18M3 12h18M3 18h18"></path>
              </svg>
              통행료/기타
            </span>
            <span className="summary-value">{formatWon(summary.misc)}</span>
          </div>
        )}
      </div>
    </>
  )
}
