// @ts-check
import { useState } from 'react'
import { isCloudSession } from '../lib/cloudSession.js'
import { requestSupportInquirySave } from '../lib/supportInquiryMutations.js'

/** @typedef {'faq'|'inquiry'|'myInquiries'} SupportTab */
/** @typedef {import('../lib/outboxTypes.js').AppSession} AppSession */

const FAQ_ITEMS = [
  {
    q: '운행 기록은 자동으로 저장되나요?',
    a: '로그인하면 클라우드에 자동 저장됩니다. 게스트(비회원)로 쓰시면 이 기기에만 저장되므로, 브라우저 데이터를 지우거나 기기를 바꾸면 기록이 사라질 수 있어요. 게스트는 앱 설정의 백업으로 꼭 보관해 주세요.',
  },
  {
    q: '차량을 추가하거나 변경하려면 어떻게 하나요?',
    a: '메뉴의 차량 관리에서 차량을 추가하고 기본 차량을 변경할 수 있습니다.',
  },
  {
    q: '데이터를 다른 기기로 옮길 수 있나요?',
    a: '로그인 계정이면 다른 기기에서 같은 계정으로 로그인하면 됩니다. 게스트 데이터는 앱 설정의 백업 파일 내보내기·가져오기로 옮길 수 있습니다.',
  },
  {
    q: '문의 답변은 어디서 확인하나요?',
    a: '"나의 문의·건의 확인" 탭에서 접수 내역과 답변 상태를 확인하실 수 있습니다.',
  },
]

const INQUIRY_TYPES = ['문의', '기능 건의', '오류 신고']

/**
 * @param {Object} props
 * @param {string} props.userId
 * @param {(message: string) => void} [props.showToast]
 */
function InquiryForm({ userId, showToast }) {
  const [type, setType] = useState(INQUIRY_TYPES[0])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function onSubmit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    const result = await requestSupportInquirySave({
      userId,
      type,
      title: title.trim(),
      content: content.trim(),
    })
    setBusy(false)
    showToast?.(result.toast)
    if (!result.ok) return
    setType(INQUIRY_TYPES[0])
    setTitle('')
    setContent('')
  }

  return (
    <form className="inquiry-form" onSubmit={onSubmit}>
      <label>
        문의 유형
        <select className="input-box" value={type} onChange={(e) => setType(e.target.value)} required>
          {INQUIRY_TYPES.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
      <label>
        제목
        <input
          className="input-box"
          maxLength={50}
          placeholder="제목을 입력해 주세요"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </label>
      <label>
        내용
        <textarea
          className="input-box"
          rows={6}
          maxLength={1000}
          placeholder="문의 내용을 자세히 적어주세요"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
        />
      </label>
      <button className="personal-account-btn" type="submit" disabled={busy}>문의 접수하기</button>
    </form>
  )
}

/**
 * @param {Object} props
 * @param {() => void} [props.onBack]
 * @param {AppSession|null} [props.session]
 * @param {(message: string) => void} [props.showToast]
 * @param {() => void} [props.onGoAuth]
 */
export default function CustomerCenterPage({ onBack, session = null, showToast, onGoAuth }) {
  const [tab, setTab] = useState(/** @type {SupportTab} */ ('faq'))
  const [openFaq, setOpenFaq] = useState(/** @type {number|null} */ (null))
  const cloud = isCloudSession(session)

  /** @param {number} index */
  function toggleFaq(index) {
    setOpenFaq((prev) => (prev === index ? null : index))
  }

  return (
    <div className="page customer-center-page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">고객센터</div>
        <div style={{ width: 40 }}></div>
      </div>

      <div className="support-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'faq'} className={`support-tab${tab === 'faq' ? ' active' : ''}`} onClick={() => setTab('faq')}>FAQ</button>
        <button type="button" role="tab" aria-selected={tab === 'inquiry'} className={`support-tab${tab === 'inquiry' ? ' active' : ''}`} onClick={() => setTab('inquiry')}>1:1 문의/건의</button>
        <button type="button" role="tab" aria-selected={tab === 'myInquiries'} className={`support-tab${tab === 'myInquiries' ? ' active' : ''}`} onClick={() => setTab('myInquiries')}>나의 문의·건의 확인</button>
      </div>

      {tab === 'faq' && (
        <section className="support-panel" aria-label="FAQ">
          <div className="support-card">
            <div className="support-card-label">FAQ</div>
            <h3>자주 묻는 질문</h3>
            <p>궁금한 내용을 빠르게 확인해 보세요.</p>
          </div>
          {FAQ_ITEMS.map((item, index) => (
            <button
              key={item.q}
              type="button"
              className={`faq-item${openFaq === index ? ' open' : ''}`}
              onClick={() => toggleFaq(index)}
            >
              <span>{item.q}</span>
              <i>{openFaq === index ? '−' : '+'}</i>
              <div className="support-detail">{item.a}</div>
            </button>
          ))}
        </section>
      )}

      {tab === 'inquiry' && (
        <section className="support-panel" aria-label="1:1 문의/건의">
          <div className="support-card">
            <div className="support-card-label">1:1 SUPPORT</div>
            <h3>무엇을 도와드릴까요?</h3>
            <p>문의나 개선 의견을 남겨주시면 확인 후 답변드리겠습니다.</p>
          </div>
          {cloud && session?.userId ? (
            <InquiryForm userId={session.userId} showToast={showToast} />
          ) : (
            <div className="support-panel-empty">
              <p>로그인 후 이용해 주세요.</p>
              <button type="button" className="personal-account-btn" onClick={onGoAuth}>로그인하러 가기</button>
            </div>
          )}
        </section>
      )}

      {tab === 'myInquiries' && (
        <section className="support-panel" aria-label="나의 문의·건의 확인">
          <div className="support-card">
            <div className="support-card-label">MY INQUIRIES</div>
            <h3>나의 문의·건의 확인</h3>
            <p>접수하신 문의와 답변 상태를 확인할 수 있습니다.</p>
          </div>
          <div className="support-panel-empty">문의 내역 확인은 다음 업데이트에서 추가됩니다.</div>
        </section>
      )}
    </div>
  )
}
