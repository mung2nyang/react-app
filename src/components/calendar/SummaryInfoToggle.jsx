// @ts-check
// 로드맵 12번: 정산 카드 한 줄 + 이름 옆 (i) 버튼, 누르면 줄 바로 아래에 설명이 펼쳐진다(펼침 상태는 화면 안에서만).
import { useId, useState } from 'react'
import './calendar-month-summary.css'

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
  const [open, setOpen] = useState(false)
  const infoId = useId()
  return (
    <>
      <div className={className}>
        <span className="summary-info-label">
          <span className={labelClassName}>{label}</span>
          <button
            type="button"
            className="summary-info-btn"
            aria-label={`${infoName} 설명 ${open ? '접기' : '보기'}`}
            aria-expanded={open}
            aria-controls={infoId}
            onClick={() => setOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="11"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </button>
        </span>
        <span className="summary-value">{value}</span>
      </div>
      {open && <p id={infoId} className="summary-info-text">{info}</p>}
    </>
  )
}
