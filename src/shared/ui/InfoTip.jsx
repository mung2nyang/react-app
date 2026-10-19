// @ts-check
// (i) 버튼 + 누르면 (i) 바로 아래 뜨는 설명 카드(펼침 상태는 화면 안에서만). 정산 카드·차량 폼 공용.
import { useId, useLayoutEffect, useRef, useState } from 'react'
import './info-tip.css'

/** 카드가 넘으면 안 되는 오른쪽 끝 — 가장 가까운 스크롤 창(모달 등)과 화면 중 더 안쪽. */
function rightLimit(/** @type {HTMLElement} */ card) {
  let limit = document.documentElement.clientWidth
  for (let el = card.parentElement; el && el !== document.body; el = el.parentElement) {
    const style = window.getComputedStyle(el)
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
      limit = Math.min(limit, el.getBoundingClientRect().left + el.clientWidth)
      break
    }
  }
  return limit
}

/**
 * @param {Object} props
 * @param {string} props.name 화면 읽기용 이름(예: "합계")
 * @param {string} props.info 펼칠 설명(줄바꿈 
 가능)
 */
export default function InfoTip({ name, info }) {
  const [open, setOpen] = useState(false)
  const infoId = useId()
  const cardRef = useRef(/** @type {HTMLSpanElement|null} */ (null))
  // 카드가 화면(또는 감싸는 스크롤 창) 오른쪽 밖으로 나가면 그만큼 왼쪽으로 당긴다(꼬리는 (i)를 계속 가리킴).
  // 카드는 왼쪽 밖에서 시작해 자리를 계산한다 — 한순간이라도 오른쪽으로 넘치면 모바일에서 스크롤이 맨 위로 튄다.
  useLayoutEffect(() => {
    const card = cardRef.current
    const anchor = card?.parentElement
    if (!open || !card || !anchor) return
    const right = anchor.getBoundingClientRect().left - 14 + card.offsetWidth
    const overflow = right - (rightLimit(card) - 12)
    card.style.setProperty('--shift', `${overflow > 0 ? -overflow : 0}px`)
  }, [open])
  return (
    <span className="summary-info-anchor">
      <button
        type="button"
        className="summary-info-btn"
        aria-label={`${name} 설명 ${open ? '접기' : '보기'}`}
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
      {open && (
        <span
          id={infoId}
          ref={cardRef}
          role="note"
          className="summary-info-text"
          style={/** @type {import('react').CSSProperties} */ ({ '--shift': '-9999px' })}
        >
          {info}
        </span>
      )}
    </span>
  )
}
