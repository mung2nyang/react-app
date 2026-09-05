// @ts-check
import { formatPhoneNumber } from '../../lib/formatPhone.js'
import AuthBackIcon from './AuthBackIcon.jsx'

const BANNER = '/images/banner_image.png'

/**
 * @typedef {{ name: string, phone: string, password: string }} AuthLoginFields
 */

/**
 * @param {Object} props
 * @param {AuthLoginFields} props.login
 * @param {(next: AuthLoginFields) => void} props.setLogin
 * @param {string|boolean} props.loginReady
 * @param {boolean} props.busy
 * @param {() => void} props.onBack
 * @param {() => void} [props.onForgotPassword]
 * @param {() => void} props.onSubmit
 */
export default function AuthLoginView({
  login, setLogin, loginReady, busy, onBack, onForgotPassword, onSubmit,
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
          <h1>정보를<br />입력해 주세요.</h1>
        </div>
        <div className="auth-form-fields">
          <div className="auth-field">
            <label htmlFor="loginUserName">이름</label>
            <input
              id="loginUserName"
              className="auth-input-box"
              placeholder="이름을 입력하세요"
              autoComplete="name"
              value={login.name}
              onChange={(e) => setLogin({ ...login, name: e.target.value })}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="loginUserPhone">휴대전화 번호</label>
            <input
              id="loginUserPhone"
              type="tel"
              className="auth-input-box"
              placeholder="010-0000-0000"
              autoComplete="tel"
              value={login.phone}
              onChange={(e) => setLogin({ ...login, phone: formatPhoneNumber(e.target.value) })}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="loginPassword">비밀번호</label>
            <input
              id="loginPassword"
              type="password"
              className="auth-input-box"
              placeholder="6자 이상 입력해 주세요"
              autoComplete="current-password"
              value={login.password}
              onChange={(e) => setLogin({ ...login, password: e.target.value })}
            />
            <div className="auth-field-extra">
              <button type="button" className="auth-link-text" onClick={onForgotPassword}>비밀번호 찾기</button>
            </div>
          </div>
        </div>
        <div className="auth-bottom-sticky">
          <button
            type="button"
            className={`auth-primary-btn${busy ? ' save-action-loading' : ''}`}
            disabled={!loginReady || busy}
            onClick={onSubmit}
          >
            다음
          </button>
        </div>
      </div>
    </div>
  )
}
