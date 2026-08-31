// @ts-check
// Step 5(달력 홈 재작성): MainPage.jsx의 미수금 미니 카드 + 월간 운송료 정산 카드를 옮긴다.
// 1회 단가 입력은 없다 — 고정노선 운임은 거래처 fixedUnitPrice로만 계산한다.
import { formatWon } from '../../domain/money.js'

/**
 * domain/day-record.js의 monthWorkFareSummary 반환 모양(그 파일은 아직
 * // @ts-check가 없어 공식 타입을 내보내지 않는다 — 여기서 소비하는 형태만 정의).
 * @typedef {Object} FareSummary
 * @property {number} trips
 * @property {number} callTrips
 * @property {number} fixedFare
 * @property {number} callFare
 * @property {number} fare
 * @property {number} vat
 * @property {number} total
 */

/**
 * @param {Object} props
 * @param {boolean} props.paymentOn
 * @param {number} props.unpaidTotal
 * @param {FareSummary} props.fareSummary
 * @param {number} [props.commissionTotal] 거래처 운임 수수료 합(매출 화면과 같은
 *   getOwnerMonthlyFinanceDetail(...).income.commission.total). 표시 전용.
 */
export default function CalendarMonthSummary({ paymentOn, unpaidTotal, fareSummary, commissionTotal = 0 }) {
  const commission = Math.max(0, Number(commissionTotal) || 0)
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
          <span>횟수 {fareSummary.trips}회 · 세부 입력 {fareSummary.callTrips}건</span>
        </div>
        <div className="summary-row">
          <span>기본 운송료 (횟수×단가)</span>
          <span className="summary-value">{formatWon(fareSummary.fixedFare)}</span>
        </div>
        <div className="summary-row">
          <span>세부 입력 운임</span>
          <span className="summary-value">{formatWon(fareSummary.callFare)}</span>
        </div>
        <div className="summary-row">
          <span>공급가액</span>
          <span className="summary-value">{formatWon(fareSummary.fare)}</span>
        </div>
        <div className="summary-row">
          <span>부가세 (공급가액 기준 10%)</span>
          <span className="summary-value">{formatWon(fareSummary.vat)}</span>
        </div>
        {commission > 0 && (
          <div className="summary-row">
            <span>운임 수수료</span>
            <span className="summary-value">-{formatWon(commission)}</span>
          </div>
        )}
        <div className="summary-row total">
          <span>합계</span>
          <span className="summary-value">{formatWon(fareSummary.total - commission)}</span>
        </div>
        <p className="summary-hint">
          횟수×단가에 세부 입력 운임을 더합니다. 면제 건은 부가세 0원입니다.
          {commission > 0 && ' 운임 수수료는 거래처(콜 저장 시점) 기준입니다.'}
        </p>
      </div>
    </>
  )
}
