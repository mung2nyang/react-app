// @ts-check
import { assetPath } from '../../lib/assetPath.js'

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
 * 첫 화면: 구글 로그인(처음이면 /welcome 기본 정보 → 첫 설정)과 비회원 시작만.
 * @param {Object} props
 * @param {() => void} [props.onGuest]
 * @param {() => void} [props.onGoogle]
 * @param {boolean} [props.busy]
 */
export default function AuthIntroView({ onGuest, onGoogle, busy = false }) {
  return (
    <div className="account-flow-page">
      <div className="auth-view auth-intro-view">
        <div className="auth-brand-head">
          <img src={BANNER} alt="" className="auth-logo-img" />
          <span className="auth-logo-text">운행 일지</span>
        </div>
        <div className="auth-intro-bottom">
          <div className="auth-btn-stack">
            <button type="button" className="auth-google-btn" disabled={busy} onClick={onGoogle}>
              <GoogleLogo />
              <span>Google 계정으로 로그인</span>
            </button>
          </div>
          <button type="button" className="auth-guest-btn" onClick={onGuest}>비회원으로 시작하기</button>
        </div>
      </div>
    </div>
  )
}
