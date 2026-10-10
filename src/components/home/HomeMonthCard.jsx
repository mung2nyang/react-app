// @ts-check
// 새 홈 "이번 달 정산 합계": 운행 탭 달력 "월간 운송료 정산" 카드의 "합계"와 같은 값(같은 훅 useMonthSettlement).
// 지출이 있으면 맨 위에 "이번 달 지출 합계"(달력 카드의 정비비·주유비·통행료/기타 줄을 더한 값).
import { formatWon } from '../../domain/money.js'

/**
 * @param {Object} props
 * @param {number} props.total
 * @param {number} props.expenseTotal
 * @param {() => void} props.onOpenCalendar
 */
export default function HomeMonthCard({ total, expenseTotal, onOpenCalendar }) {
  return (
    <button type="button" className="home-card home-month-card" onClick={onOpenCalendar}>
      <span className="home-month-copy">
        {expenseTotal > 0 && (
          <span className="home-month-expense">이번 달 지출 합계 <strong>{formatWon(expenseTotal)}</strong></span>
        )}
        <span className="home-card-label">이번 달 정산 합계</span>
        <strong className="home-month-total">{formatWon(total)}</strong>
      </span>
      <span className="home-month-link">달력에서 보기 ›</span>
    </button>
  )
}
