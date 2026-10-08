// @ts-check
import { useState } from 'react'
import PageHeader from './PageHeader.jsx'
import './notice.css'

// 실제 공지는 출시 때 추가(임시 글 삭제, 문구 정리 1).
/** @type {Array<{ title: string, date: string, body: string }>} */
const NOTICES = []

/**
 * @param {Object} props
 * @param {() => void} [props.onBack]
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function NoticePage({ onBack, onOpenMenu }) {
  const [openIndex, setOpenIndex] = useState(/** @type {number|null} */ (null))

  /** @param {number} index */
  function toggle(index) {
    setOpenIndex((prev) => (prev === index ? null : index))
  }

  return (
    <div className="page notice-page">
      <PageHeader title="공지사항" onBack={onBack} onOpenMenu={onOpenMenu} />

      <section className="support-panel" aria-label="공지사항">
        {NOTICES.length === 0 && <div className="empty-state">등록된 공지사항이 없습니다.</div>}
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
