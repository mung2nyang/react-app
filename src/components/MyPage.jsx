import { loadProfile } from '../lib/profile.js'

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
      <circle cx="12" cy="7" r="4"></circle>
    </svg>
  )
}

const SHORTCUTS = [
  {
    page: 'cars',
    title: '차량 관리',
    hint: '차량 정보와 기사차량',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M3 14.5v-2l2.5-1.4 1.6-3.7A2.3 2.3 0 0 1 9.2 6h5.6a2.3 2.3 0 0 1 2.1 1.4l1.6 3.7 2.5 1.4v4.2"></path>
        <path d="M5 18h-.7A1.3 1.3 0 0 1 3 16.7v-2.2M9 18h6M6 11h12"></path>
        <circle cx="6.8" cy="17.5" r="2.5"></circle>
        <circle cx="17.2" cy="17.5" r="2.5"></circle>
      </svg>
    ),
  },
  {
    page: 'clients',
    title: '거래처',
    hint: '연락처와 수수료',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
      </svg>
    ),
  },
  {
    page: 'receivables',
    title: '미수금/정산',
    hint: '입금 예정과 수금 관리',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M3 3v18h18"></path>
        <path d="M7 16v-5M12 16V7M17 16V8"></path>
      </svg>
    ),
  },
  {
    page: 'expenses',
    title: '정비/주유/기타',
    hint: '월별 비용과 내역',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
      </svg>
    ),
  },
  {
    page: 'report',
    title: '운송비 내역서',
    hint: '월별 내역 확인과 공유',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
      </svg>
    ),
  },
  {
    page: 'invoices',
    title: '세금계산서',
    hint: '작성 자료와 발급 관리',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z"></path>
        <path d="M9 6h6M9 12h6M9 16h4"></path>
      </svg>
    ),
  },
]

export default function MyPage({ session, ownerKey = 'guest', onOpen, onBack }) {
  const profile = loadProfile(ownerKey)
  const employed = session?.accountType === 'employed_driver'
  const displayName = profile.name || (session?.name && session.name !== '비회원' ? session.name : '') || (employed ? '기사' : '대표자')

  return (
    <div className="page my-page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">마이페이지</div>
        <span className="mypage-header-spacer" aria-hidden="true"></span>
      </div>

      <button type="button" className="mypage-profile-card" onClick={() => onOpen('profile')}>
        <span className="mypage-profile-icon" aria-hidden="true"><PersonIcon /></span>
        <span className="mypage-profile-copy">
          <strong>개인정보</strong>
          <span className="mypage-role-user-row">
            <span className="mypage-role-pill">{employed ? '소속 기사' : '차주'}</span>
            <span className="mypage-user-name">{displayName}</span>
          </span>
        </span>
        <svg className="mypage-link-arrow" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>

      <section className="mypage-shortcut-section" aria-labelledby="myPageShortcutTitle">
        <div className="mypage-section-heading">
          <h3 id="myPageShortcutTitle">업무 바로가기</h3>
          <p>자주 사용하는 관리 메뉴</p>
        </div>
        <div className="mypage-shortcut-grid">
          {SHORTCUTS.map((item) => (
            <button key={item.page} type="button" className="mypage-shortcut" onClick={() => onOpen(item.page)}>
              <span className="mypage-shortcut-icon" aria-hidden="true">{item.icon}</span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.hint}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="mypage-notice-area">
        <button type="button" className="mypage-notice-link" onClick={() => onOpen('settings')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0 1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          <span>앱 설정</span>
        </button>
        <button type="button" className="mypage-notice-link" onClick={() => onOpen('drivers')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M19 8v6M16 11h6"></path>
          </svg>
          <span>기사연동관리</span>
        </button>
        <button type="button" className="mypage-notice-link" onClick={() => onOpen('soon', '문자 문구 설정')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>
            <path d="M8 9h8M8 13h5"></path>
          </svg>
          <span>문자 문구 설정</span>
        </button>
        <button type="button" className="mypage-notice-link mypage-notice-entry" onClick={() => onOpen('soon', '공지사항')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m3 11 18-5v12L3 14v-3z"></path>
            <path d="M8 9v6M7 15.2 8.8 21H13l-1.7-5"></path>
          </svg>
          <span>공지사항</span>
        </button>
      </div>
    </div>
  )
}
