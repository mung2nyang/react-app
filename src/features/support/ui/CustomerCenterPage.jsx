// @ts-check
// 고객센터 탭 화면(FAQ는 여기, 문의 작성은 InquiryForm, 내 문의는 MyInquiriesList).
import { useState } from 'react'
import { isCloudSession } from '../../../data/cloud/cloudSession.ts'
import PageHeader from '../../../shared/ui/PageHeader.jsx'
import InquiryForm from './InquiryForm.jsx'
import MyInquiriesList from './MyInquiriesList.jsx'
import './customer-center.css'
import { useSession } from '../../../data/cloud/sessionContext.ts'

/** @typedef {'faq'|'inquiry'|'myInquiries'} SupportTab */

const FAQ_ITEMS = [
  {
    q: '운행 기록은 자동으로 저장되나요?',
    a: '로그인하면 서버에 자동 저장됩니다. 비회원은 이 휴대폰에만 저장되므로, 앱을 지우거나 휴대폰을 바꾸면 기록이 사라질 수 있습니다. 앱 설정의 백업으로 꼭 보관해 주세요.',
  },
  {
    q: '차량을 추가하거나 변경하려면 어떻게 하나요?',
    a: '메뉴 → 차량 관리에서 차량을 추가하거나 수정할 수 있습니다.',
  },
  {
    q: '데이터를 다른 기기로 옮길 수 있나요?',
    a: '로그인 계정은 다른 휴대폰에서 같은 계정으로 로그인하면 됩니다. 비회원 기록은 앱 설정의 [백업 저장하기]로 파일을 만든 뒤, 새 휴대폰에서 [백업 불러오기]로 옮길 수 있습니다.',
  },
  {
    q: '문의 답변은 어디서 확인하나요?',
    a: '"나의 문의/건의 확인" 탭에서 접수 내역과 답변 상태를 확인하실 수 있습니다.',
  },
]

/**
 * @param {Object} props
 * @param {() => void} [props.onGoAuth]
 */
function GuestLoginPrompt({ onGoAuth }) {
  return (
    <div className="support-panel-empty">
      <p>로그인 후 이용해 주세요.</p>
      <button type="button" className="personal-account-btn" onClick={onGoAuth}>로그인하러 가기</button>
    </div>
  )
}

/**
 * @param {Object} props
 * @param {() => void} [props.onBack]
 * @param {() => void} [props.onGoAuth]
 * @param {(() => void)} [props.onOpenMenu]
 */
export default function CustomerCenterPage({ onBack, onGoAuth, onOpenMenu }) {
  const { session } = useSession()
  const [tab, setTab] = useState(/** @type {SupportTab} */ ('faq'))
  const [openFaq, setOpenFaq] = useState(/** @type {number|null} */ (null))
  const cloud = isCloudSession(session)
  const userId = cloud ? session?.userId : null

  /** @param {number} index */
  function toggleFaq(index) {
    setOpenFaq((prev) => (prev === index ? null : index))
  }

  return (
    <div className="page customer-center-page">
      <PageHeader title="고객센터" onBack={onBack} onOpenMenu={onOpenMenu} />

      <div className="support-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'faq'} className={`support-tab${tab === 'faq' ? ' active' : ''}`} onClick={() => setTab('faq')}>FAQ</button>
        <button type="button" role="tab" aria-selected={tab === 'inquiry'} className={`support-tab${tab === 'inquiry' ? ' active' : ''}`} onClick={() => setTab('inquiry')}>1:1 문의/건의</button>
        <button type="button" role="tab" aria-selected={tab === 'myInquiries'} className={`support-tab${tab === 'myInquiries' ? ' active' : ''}`} onClick={() => setTab('myInquiries')}>나의 문의/건의 확인</button>
      </div>

      {tab === 'faq' && (
        <section className="support-panel" aria-label="FAQ">
          <div className="support-card">
            <h3>자주 묻는 질문</h3>
          </div>
          {FAQ_ITEMS.map((item, index) => (
            <button key={item.q} type="button" className={`faq-item${openFaq === index ? ' open' : ''}`} onClick={() => toggleFaq(index)}>
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
            <h3>무엇을 도와드릴까요?</h3>
            <p>문의나 개선 의견을 남겨주시면 확인 후 답변드리겠습니다.</p>
          </div>
          {userId ? <InquiryForm userId={userId} /> : <GuestLoginPrompt onGoAuth={onGoAuth} />}
        </section>
      )}

      {tab === 'myInquiries' && (
        <section className="support-panel" aria-label="나의 문의/건의 확인">
          <div className="support-card">
            <h3>나의 문의/건의 확인</h3>
            <p>접수하신 문의와 답변 상태를 확인할 수 있습니다.</p>
          </div>
          {userId ? <MyInquiriesList userId={userId} /> : <GuestLoginPrompt onGoAuth={onGoAuth} />}
        </section>
      )}
    </div>
  )
}
