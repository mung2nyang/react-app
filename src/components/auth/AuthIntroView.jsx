// @ts-check
const BANNER = '/images/banner_image.png'

/**
 * @param {Object} props
 * @param {() => void} [props.onGuest]
 * @param {() => void} props.onLogin
 * @param {() => void} props.onSignup
 */
export default function AuthIntroView({ onGuest, onLogin, onSignup }) {
  return (
    <div className="account-flow-page">
      <div className="auth-view auth-intro-view">
        <div className="auth-brand-head">
          <img src={BANNER} alt="" className="auth-logo-img" />
          <span className="auth-logo-text">운행 일지</span>
        </div>
        <div className="auth-intro-bottom">
          <p className="auth-question-text">계정이 있으신가요?</p>
          <div className="auth-btn-stack">
            <button type="button" className="auth-primary-btn" onClick={onLogin}>로그인</button>
            <button type="button" className="auth-secondary-btn" onClick={onSignup}>회원가입</button>
          </div>
          <button type="button" className="auth-guest-btn" onClick={onGuest}>비회원으로 시작하기</button>
        </div>
      </div>
    </div>
  )
}
