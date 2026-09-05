// @ts-check
import { formatPhoneNumber } from '../../lib/formatPhone.js'
import AuthBackIcon from './AuthBackIcon.jsx'

const BANNER = '/images/banner_image.png'

/**
 * @typedef {{ name: string, phone: string, password: string, passwordConfirm: string }} AuthSignupFields
 */

/**
 * @param {Object} props
 * @param {AuthSignupFields} props.signup
 * @param {(next: AuthSignupFields) => void} props.setSignup
 * @param {string|boolean} props.signupReady
 * @param {boolean} props.busy
 * @param {() => void} props.onBack
 * @param {() => void} props.onSubmit
 */
export default function AuthSignupView({
  signup, setSignup, signupReady, busy, onBack, onSubmit,
}) {
  return (
    <div className="account-flow-page">
      <div className="auth-view">
        <div className="auth-topbar">
          <button type="button" className="auth-back-icon-btn" onClick={onBack} aria-label="뒤로가기">
            <AuthBackIcon />
          </button>
          <div className="auth-brand-sm">
            <img src={BANNER} alt="" className="auth-logo-sm" />
            <span>운행 일지</span>
          </div>
        </div>
        <div className="auth-heading-box">
          <span className="auth-kicker">WELCOME</span>
          <h1>회원가입</h1>
          <p className="auth-desc-text">
            운행 기록은 클라우드에 안전하게 백업되어 다른 기기에서 로그인해도 그대로 이어집니다. 그래도 만약을 대비해 설정 메뉴의 로컬 백업 기능도 함께 이용해 주세요.
          </p>
        </div>

        <div className="auth-form-fields">
          <div className="auth-field">
            <label htmlFor="signupName">이름</label>
            <input
              id="signupName"
              className="auth-input-box"
              placeholder="이름을 입력하세요"
              autoComplete="name"
              value={signup.name}
              onChange={(e) => setSignup({ ...signup, name: e.target.value })}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="signupPhone">휴대전화 번호</label>
            <input
              id="signupPhone"
              type="tel"
              className="auth-input-box"
              placeholder="010-0000-0000"
              autoComplete="tel"
              value={signup.phone}
              onChange={(e) => setSignup({ ...signup, phone: formatPhoneNumber(e.target.value) })}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="signupPw">비밀번호</label>
            <input
              id="signupPw"
              type="password"
              className="auth-input-box"
              placeholder="6자 이상 입력해 주세요"
              autoComplete="new-password"
              value={signup.password}
              onChange={(e) => setSignup({ ...signup, password: e.target.value })}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="signupPwConfirm">비밀번호 확인</label>
            <input
              id="signupPwConfirm"
              type="password"
              className="auth-input-box"
              placeholder="비밀번호를 한 번 더 입력해 주세요"
              autoComplete="new-password"
              value={signup.passwordConfirm}
              onChange={(e) => setSignup({ ...signup, passwordConfirm: e.target.value })}
            />
          </div>
        </div>
        <div className="auth-bottom-sticky">
          <button
            type="button"
            className={`auth-primary-btn${busy ? ' save-action-loading' : ''}`}
            disabled={!signupReady || busy}
            onClick={onSubmit}
          >
            가입하고 시작하기
          </button>
        </div>
      </div>
    </div>
  )
}
