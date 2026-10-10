// @ts-check
// 새 홈 "할 일" 카드: 오늘 일상점검 안 함 + 미수(미수금 화면과 같은 목록에서 센 건수·남은 금액). 없으면 "할 일 없음".
import { formatWon } from '../../domain/money.js'

/**
 * @param {Object} props
 * @param {boolean} props.inspectionMissing
 * @param {number} props.unpaidCount
 * @param {number} props.unpaidTotal
 * @param {() => void} props.onOpenInspection
 * @param {() => void} props.onOpenReceivables
 */
export default function HomeTodoCard({ inspectionMissing, unpaidCount, unpaidTotal, onOpenInspection, onOpenReceivables }) {
  if (!inspectionMissing && unpaidCount === 0) {
    return <section className="home-card home-todo-empty" aria-label="할 일">할 일 없음</section>
  }
  return (
    <section className="home-card home-todo-card" aria-label="할 일">
      <p className="home-card-label">할 일</p>
      {inspectionMissing && (
        <button type="button" className="home-todo-row" onClick={onOpenInspection}>
          <span>오늘 일상점검 안 함</span><span className="home-row-arrow" aria-hidden="true">›</span>
        </button>
      )}
      {unpaidCount > 0 && (
        <button type="button" className="home-todo-row" onClick={onOpenReceivables}>
          <span>미수금 {unpaidCount}건 · {formatWon(unpaidTotal)}</span><span className="home-row-arrow" aria-hidden="true">›</span>
        </button>
      )}
    </section>
  )
}
