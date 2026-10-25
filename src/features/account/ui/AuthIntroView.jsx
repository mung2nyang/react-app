// @ts-check
import { assetPath } from '../../../shared/utils/assetPath.js'
import './auth-intro.css'

const BANNER = assetPath('/images/banner_image.png')

/** 구글 공식 4색 G 로고(변형 금지 — 구글 로그인 버튼 규칙). */
function GoogleLogo() {
  return (
    <svg className="auth-google-logo" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

/**
 * 첫 화면: 소개 문구, 구글 로그인(처음이면 /welcome 기본 정보 → 첫 설정)과 비회원 시작, 약관 안내(링크 없음).
 * @param {Object} props
 * @param {() => void} [props.onGuest]
 * @param {() => void} [props.onGoogle]
 * @param {boolean} [props.busy]
 */
export default function AuthIntroView({ onGuest, onGoogle, busy = false }) {
  return (
    <div className="account-flow-page">
      <div className="auth-view auth-intro-view">
        <div>
          <div className="auth-brand-head">
            <img src={BANNER} alt="" className="auth-logo-img" />
            <span className="auth-logo-text">운행일지</span>
          </div>
          <p className="auth-intro-eyebrow">간편한 화물 차량 운행 관리</p>
          <div className="auth-heading-box">
            <h1>운행 기록을<br />간편하게 관리하세요</h1>
            <p className="auth-desc-text">매일의 운행 내역을 쉽고 빠르게 기록해 보세요.</p>
          </div>
        </div>
        <div className="auth-intro-bottom">
          <button
            type="button"
            className={`auth-google-btn${busy ? ' auth-google-btn-loading' : ''}`}
            disabled={busy}
            aria-busy={busy}
            onClick={onGoogle}
          >
            <GoogleLogo />
            <span>Google 계정으로 로그인하기</span>
            {busy && <span className="boot-loading-dots" aria-hidden="true"><span></span><span></span><span></span></span>}
          </button>
          <button type="button" className="auth-guest-btn" onClick={onGuest}>비회원으로 시작하기</button>
          <p className="auth-intro-terms">
            최초 로그인 시 <span className="auth-intro-term">서비스 이용약관</span> 및{' '}
            <span className="auth-intro-term">개인정보 처리방침</span>,{' '}
            <span className="auth-intro-term">위치기반서비스 이용약관</span>에 동의하는 것으로 간주합니다.
          </p>
        </div>
      </div>
    </div>
  )
}
