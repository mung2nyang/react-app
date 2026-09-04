// @ts-check
// Step 9 슬라이스 B: 서브 차량 달력 모드 배너(메인 복귀). CalendarPage 150줄 한도용 분리.
import { getShortCarNum } from '../../domain/cars.js'

/**
 * @param {Object} props
 * @param {string} props.logId
 * @param {() => void} props.onBackToMain
 */
export default function CalendarSubLogBanner({ logId, onBackToMain }) {
  const short = getShortCarNum(logId)
  return (
    <div className="sub-car-log-banner" role="status">
      <span className="sub-car-log-banner-title">{short} 운행 일지</span>
      <button type="button" className="sub-car-log-banner-back" onClick={onBackToMain}>
        메인 일지로
      </button>
    </div>
  )
}
