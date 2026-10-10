// @ts-check
// 새 홈 "오늘" 카드: 날짜·상태 제목·운행 줄(고정 노선 횟수 + 콜 최대 3줄)·오늘 일지 열기 버튼. 숫자는 달력 칸과 같은 함수.
import { dayFareTotal, dayWorkBadgeLabel } from '../../domain/calendarBadges.js'
import { getCallDetails, getFixedCount, isOffDay } from '../../domain/day-record.js'
import { formatWon, parseCurrencyValue } from '../../domain/money.js'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const MAX_CALL_ROWS = 3

/**
 * @param {Object} props
 * @param {import('../../domain/dayRecordTypes.js').DayRecordLike|undefined} props.record
 * @param {{ dateKey: string, month: number, day: number }} props.today
 * @param {number} props.weekday 0 = 일요일
 * @param {'count'|'fare'} props.inputMode
 * @param {number|string} props.unitPrice
 * @param {(dateKey: string) => void} props.onOpenToday
 */
export default function HomeTodayCard({ record, today, weekday, inputMode, unitPrice, onOpenToday }) {
  const off = isOffDay(record)
  const label = dayWorkBadgeLabel(record, { inputMode, unitPrice })
  const fare = dayFareTotal(record, unitPrice)
  const showFare = inputMode === 'count' && fare > 0
  const status = off
    ? '오늘은 휴무입니다'
    : label ? `오늘 ${label}${showFare ? ` · ${formatWon(fare)}` : ''}` : '아직 기록이 없습니다'
  const fixedCount = off ? 0 : getFixedCount(record)
  const calls = off ? [] : getCallDetails(record)

  return (
    <section className="home-card home-today-card" aria-label="오늘 운행">
      <p className="home-today-date">{today.month}월 {today.day}일 ({WEEKDAYS[weekday]})</p>
      <p className="home-today-status">{status}</p>
      {(fixedCount > 0 || calls.length > 0) && (
        <ul className="home-trip-list">
          {fixedCount > 0 && (
            <li className="home-trip-row"><span className="home-trip-route">고정 노선</span><span>{fixedCount}회</span></li>
          )}
          {calls.slice(0, MAX_CALL_ROWS).map((call, index) => (
            <li key={call.id || index} className="home-trip-row">
              <span className="home-trip-route">{call.loadLoc || '상차지 없음'} → {call.unloadLoc || '하차지 없음'}</span>
              <span>{formatWon(parseCurrencyValue(call.fare))}</span>
            </li>
          ))}
          {calls.length > MAX_CALL_ROWS && (
            <li className="home-trip-more">외 {calls.length - MAX_CALL_ROWS}건</li>
          )}
        </ul>
      )}
      <button type="button" className="home-today-btn" onClick={() => onOpenToday(today.dateKey)}>
        {off ? '일지 열기' : label ? '하나 더 기록' : '운행 기록하기'}
      </button>
    </section>
  )
}
