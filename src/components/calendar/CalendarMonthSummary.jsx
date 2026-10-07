// @ts-check
// Step 5(달력 홈 재작성): MainPage.jsx의 미수금 미니 카드 + 월간 운송료 정산 카드를 옮긴다.
// 이관 계획 ③-2: monthSettlementSummary 반환값으로 거래처별·파렛트·서브수수료·지출 행 렌더.
import { formatWon } from '../../domain/money.js'
import SummaryInfoToggle from './SummaryInfoToggle.jsx'

/**
 * @typedef {ReturnType<typeof import('../../domain/monthSettlement.js').monthSettlementSummary>} MonthSettlementSummary
 */

const TOTAL_INFO = '운송료 + 파렛트 회수 청구액 − 수수료 + 부가세예요. 아래 정비비·주유비·통행료는 합계에서 빼지 않은 이번 달 차량 지출 기록이에요.'

/** 수수료 설정 표시: "10%"는 그대로, 금액은 "건당 5,000원" @param {string} setting */
function perTripSetting(setting) {
  return setting.endsWith('%') || setting.startsWith('건당') ? setting : `건당 ${setting}`
}

/** @param {string} setting */
function clientCommInfo(setting) {
  const shown = setting ? `(${perTripSetting(setting)})` : ''
  return `거래처 등록 때 적은 수수료${shown}만큼 이 거래처 운송료에서 빼요.`
}

/** 라벨 "3456 차량 10%" / "3456 차량 건당 5,000원" → 설정 부분만 @param {string} label */
function subCarCommInfo(label) {
  const setting = label.replace(/^\S+ 차량 /, '')
  const shown = setting && setting !== label ? `(${setting})` : ''
  return `차량 관리에 적은 이 차량의 수수료${shown}예요. 운송료에서 거래처 수수료를 뺀 금액을 기준으로 계산해 빼요.`
}

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
              <SummaryInfoToggle
                className="summary-row summary-client-commission-row"
                labelClassName="summary-client-commission-label"
                label={`${client} 수수료 (${summary.commissionLabelByClient[client]})`}
                value={`- ${formatWon(summary.commissionByClient[client])}`}
                infoName={`${client} 수수료`}
                info={clientCommInfo(String(summary.commissionLabelByClient[client] || ''))}
              />
            )}
          </div>
        ))}

        {summary.subCarComm > 0 && (
          <SummaryInfoToggle
            className="summary-row"
            label={summary.subCarCommLabel}
            value={`- ${formatWon(summary.subCarComm)}`}
            infoName="기사차량 수수료"
            info={subCarCommInfo(summary.subCarCommLabel)}
          />
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
        <SummaryInfoToggle className="summary-row total" label="합계" value={formatWon(summary.total)} infoName="합계" info={TOTAL_INFO} />

        {summary.maint > 0 && (
          <div
            className="summary-row summary-expense-first"
            style={{ marginTop: 8, paddingTop: 8, color: 'var(--sunday-color)' }}
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
