import { useState } from 'react'
import { formatPhoneNumber } from '../lib/formatPhone.js'
import {
  ensureProfileRow,
  getSupabaseAuthErrorMessage,
  signInWithPhone,
  signUpWithPhone,
} from '../supabaseClient.js'

const BANNER = '/images/banner_image.png'

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
  )
}

function OwnerIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M3 14.5v-2l2.5-1.4 1.6-3.7A2.3 2.3 0 0 1 9.2 6h5.6a2.3 2.3 0 0 1 2.1 1.4l1.6 3.7 2.5 1.4v4.2"></path>
      <path d="M5 18h14M6 11h12"></path>
      <circle cx="6.8" cy="17.5" r="2.5"></circle>
      <circle cx="17.2" cy="17.5" r="2.5"></circle>
    </svg>
  )
}

function DriverIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="7" r="4"></circle>
      <path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"></path>
      <path d="M9 21v-4h6v4"></path>
    </svg>
  )
}

export default function AuthPage({ onGuest, onLogin, onSignup, onForgotPassword, showToast }) {
  const [view, setView] = useState('intro')
  const [busy, setBusy] = useState(false)
  const [login, setLogin] = useState({ name: '', phone: '', password: '' })
  const [signup, setSignup] = useState({
    role: 'owner_driver',
    name: '',
    phone: '',
    password: '',
    passwordConfirm: '',
    inviteCode: '',
  })

  const loginReady =
    login.name.trim() &&
    login.phone.replace(/\D/g, '').length >= 10 &&
    login.password.length >= 6

  const inviteDigits = signup.inviteCode.replace(/\D/g, '')
  const invitePartial =
    signup.role === 'employed_driver' && inviteDigits.length > 0 && inviteDigits.length < 6
  const signupReady =
    signup.name.trim() &&
    signup.phone.replace(/\D/g, '').length >= 10 &&
    signup.password.length >= 6 &&
    signup.password === signup.passwordConfirm &&
    !invitePartial

  function openLogin() {
    setLogin({ name: '', phone: '', password: '' })
    setView('login')
  }

  function openSignup() {
    setSignup({
      role: 'owner_driver',
      name: '',
      phone: '',
      password: '',
      passwordConfirm: '',
      inviteCode: '',
    })
    setView('signup')
  }

  async function handleLogin() {
    if (busy || !loginReady) return
    setBusy(true)
    try {
      const { data, error } = await signInWithPhone(login.phone, login.password)
      if (error) {
        showToast(getSupabaseAuthErrorMessage(error))
        return
      }
      showToast('로그인되었습니다.')
      onLogin({
        name: login.name.trim(),
        phone: login.phone.trim(),
        accountType: 'owner_driver',
        userId: data?.user?.id || null,
      })
    } catch (error) {
      showToast(getSupabaseAuthErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleSignup() {
    if (busy || !signupReady) return
    setBusy(true)
    try {
      const { data, error } = await signUpWithPhone(signup.phone, signup.password)
      if (error) {
        showToast(getSupabaseAuthErrorMessage(error))
        return
      }
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        showToast('이미 가입된 번호입니다. 로그인해 주세요.')
        return
      }
      if (data?.user) {
        await ensureProfileRow(data.user.id, signup.role, signup.name.trim(), signup.phone.trim())
      }
      showToast('회원가입이 완료되었습니다.')
      onSignup({
        name: signup.name.trim(),
        phone: signup.phone.trim(),
        accountType: signup.role,
        inviteCode: signup.role === 'employed_driver' ? signup.inviteCode : '',
        userId: data?.user?.id || null,
      })
    } catch (error) {
      showToast(getSupabaseAuthErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (view === 'intro') {
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
              <button type="button" className="auth-primary-btn" onClick={openLogin}>로그인</button>
              <button type="button" className="auth-secondary-btn" onClick={openSignup}>회원가입</button>
            </div>
            <button type="button" className="auth-guest-btn" onClick={onGuest}>비회원으로 시작하기</button>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'login') {
    return (
      <div className="account-flow-page">
        <div className="auth-view">
          <div className="auth-topbar">
            <button type="button" className="auth-back-icon-btn" onClick={() => setView('intro')} aria-label="뒤로가기">
              <BackIcon />
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
              onClick={handleLogin}
            >
              다음
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="account-flow-page">
      <div className="auth-view">
        <div className="auth-topbar">
          <button type="button" className="auth-back-icon-btn" onClick={() => setView('intro')} aria-label="뒤로가기">
            <BackIcon />
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

        <div className="auth-role-tabs" role="radiogroup" aria-label="사용자 유형">
          <button
            type="button"
            className={`auth-role-tab${signup.role === 'owner_driver' ? ' active' : ''}`}
            role="radio"
            aria-checked={signup.role === 'owner_driver'}
            onClick={() => setSignup({ ...signup, role: 'owner_driver', inviteCode: '' })}
          >
            <div className="auth-role-tab-icon"><OwnerIcon /></div>
            <span>차주</span>
          </button>
          <button
            type="button"
            className={`auth-role-tab${signup.role === 'employed_driver' ? ' active' : ''}`}
            role="radio"
            aria-checked={signup.role === 'employed_driver'}
            onClick={() => setSignup({ ...signup, role: 'employed_driver' })}
          >
            <div className="auth-role-tab-icon"><DriverIcon /></div>
            <span>소속 기사</span>
          </button>
        </div>
        <p className="auth-role-subtitle">
          {signup.role === 'owner_driver'
            ? '본인 차량 일지 및 기사를 관리해요.'
            : '초대 코드나 전화번호로 사장님과 연결해요.'}
        </p>

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
          {signup.role === 'employed_driver' && (
            <div className="auth-invite-row">
              <div className="auth-invite-text">
                <strong>기사 초대코드 (선택)</strong>
                <p>사장님에게 받은 6자리 코드가 있으면 입력해 주세요. 나중에 마이페이지에서도 연결할 수 있습니다.</p>
              </div>
              <input
                className="auth-input-box auth-code-box"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={signup.inviteCode}
                onChange={(e) => setSignup({ ...signup, inviteCode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
              />
            </div>
          )}
        </div>
        <div className="auth-bottom-sticky">
          <button
            type="button"
            className={`auth-primary-btn${busy ? ' save-action-loading' : ''}`}
            disabled={!signupReady || busy}
            onClick={handleSignup}
          >
            가입하고 시작하기
          </button>
        </div>
      </div>
    </div>
  )
}
