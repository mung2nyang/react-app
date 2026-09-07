// @ts-check
import { useState } from 'react'

const NOTICES = [
  {
    title: '[필독] 서비스 이용 안내',
    date: '2026.08.11',
    body: '더 편리한 운행 기록을 위해 고객센터 메뉴가 새롭게 추가되었습니다.',
  },
  {
    title: '데이터 백업 권장 안내',
    date: '2026.08.05',
    body: '중요한 운행 기록은 앱 설정의 백업 기능을 이용해 정기적으로 보관해 주세요.',
  },
  {
    title: '최근 업데이트 안내',
    date: '2026.08.01',
    body: '사용성을 개선하고 일부 화면의 디자인을 다듬었습니다.',
  },
]

/**
 * @param {Object} props
 * @param {() => void} [props.onBack]
 */
export default function NoticePage({ onBack }) {
  const [openIndex, setOpenIndex] = useState(/** @type {number|null} */ (null))

  /** @param {number} index */
  function toggle(index) {
    setOpenIndex((prev) => (prev === index ? null : index))
  }

  return (
    <div className="page notice-page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">공지사항</div>
        <div style={{ width: 40 }}></div>
      </div>

      <section className="support-panel" aria-label="공지사항">
        <div className="support-card">
          <div className="support-card-label">NOTICE</div>
          <h3>새로운 소식을 확인하세요</h3>
          <p>서비스 업데이트와 중요한 안내를 가장 먼저 전해드립니다.</p>
        </div>
        {NOTICES.map((notice, index) => (
          <button
            key={notice.title}
            type="button"
            className={`faq-item${openIndex === index ? ' open' : ''}`}
            onClick={() => toggle(index)}
          >
            <span>{notice.title} · {notice.date}</span>
            <i>{openIndex === index ? '−' : '+'}</i>
            <div className="support-detail">{notice.body}</div>
          </button>
        ))}
      </section>
    </div>
  )
}
