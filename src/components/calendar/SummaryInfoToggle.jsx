// @ts-check
// 로드맵 12번: 정산 카드 한 줄 + 이름 옆 (i) 버튼, 누르면 (i) 바로 아래에 설명 카드가 뜬다.
import InfoTip from '../shared/InfoTip.jsx'

/**
 * @param {Object} props
 * @param {string} props.className 줄 클래스(예: "summary-row total")
 * @param {import('react').ReactNode} props.label
 * @param {string} [props.labelClassName]
 * @param {import('react').ReactNode} props.value
 * @param {string} props.infoName 화면 읽기용 이름(예: "합계")
 * @param {string} props.info 펼칠 설명
 */
export default function SummaryInfoToggle({ className, label, labelClassName, value, infoName, info }) {
  return (
    <div className={className}>
      <span className="summary-info-label">
        <span className={labelClassName}>{label}</span>
        <InfoTip name={infoName} info={info} />
      </span>
      <span className="summary-value">{value}</span>
    </div>
  )
}
