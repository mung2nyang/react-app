// @ts-check
// Step 5(달력 홈 재작성): MainPage.jsx의 미수금 미니 카드 + 월간 운송료 정산 카드를 옮긴다.
// 재감사 3차(FAIL 지적 3번) — 고정노선 연결 거래처가 있으면 이 입력이 그 거래처의
// fixedUnitPrice를 고치고(CalendarPage.jsx의 saveUnitPrice), 없으면 설정의
// unitPrice를 고친다 — 어느 쪽이든 이 컴포넌트는 그냥 onSaveUnitPrice(nextPrice)만
// 부른다. linkedClientName이 있으면 어디로 반영되는지 사용자에게 알려준다.
import { formatCurrencyInput, formatWon, parseCurrencyValue } from '../../domain/money.js'

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
 * @param {number|string} props.unitPrice
 * @param {string|null} [props.linkedClientName]
 * @param {(nextPrice: number) => void} props.onSaveUnitPrice
 */
export default function CalendarMonthSummary({ paymentOn, unpaidTotal, fareSummary, unitPrice, linkedClientName, onSaveUnitPrice }) {
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
          <span>1회 단가</span>
          <input
            className="summary-price-input"
            inputMode="numeric"
            placeholder="0"
            value={formatCurrencyInput(unitPrice)}
            onChange={(e) => onSaveUnitPrice(parseCurrencyValue(e.target.value))}
            aria-label="1회 단가"
          />
        </div>
        {linkedClientName && (
          <p className="summary-hint">
            고정노선 연결 거래처 &apos;{linkedClientName}&apos;의 단가입니다 — 여기서 바꾸면 그 거래처 정보도 함께 바뀝니다.
          </p>
        )}
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
        <div className="summary-row total">
          <span>합계</span>
          <span className="summary-value">{formatWon(fareSummary.total)}</span>
        </div>
        <p className="summary-hint">횟수×단가에 세부 입력 운임을 더합니다. 면제 건은 부가세 0원입니다.</p>
      </div>
    </>
  )
}
