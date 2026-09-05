// @ts-check
import { useState } from 'react'
import {
  ensureProfileRow,
  getSupabaseAuthErrorMessage,
  signInWithPhone,
  signUpWithPhone,
} from '../supabaseClient.js'
import AuthIntroView from './auth/AuthIntroView.jsx'
import AuthLoginView from './auth/AuthLoginView.jsx'
import AuthSignupView from './auth/AuthSignupView.jsx'

/**
 * @param {Object} props
 * @param {() => void} [props.onGuest]
 * @param {(session: { name: string, phone: string, accountType: string, userId: string|null, inviteCode?: string }) => void} props.onLogin
 * @param {(session: { name: string, phone: string, accountType: string, inviteCode: string, userId: string|null }) => void} props.onSignup
 * @param {() => void} [props.onForgotPassword]
 * @param {(message: string) => void} props.showToast
 */
export default function AuthPage({ onGuest, onLogin, onSignup, onForgotPassword, showToast }) {
  const [view, setView] = useState(/** @type {'intro'|'login'|'signup'} */ ('intro'))
  const [busy, setBusy] = useState(false)
  const [login, setLogin] = useState({ name: '', phone: '', password: '' })
  const [signup, setSignup] = useState({
    name: '',
    phone: '',
    password: '',
    passwordConfirm: '',
  })

  const loginReady =
    login.name.trim() &&
    login.phone.replace(/\D/g, '').length >= 10 &&
    login.password.length >= 6

  const signupReady =
    signup.name.trim() &&
    signup.phone.replace(/\D/g, '').length >= 10 &&
    signup.password.length >= 6 &&
    signup.password === signup.passwordConfirm

  function openLogin() {
    setLogin({ name: '', phone: '', password: '' })
    setView('login')
  }

  function openSignup() {
    setSignup({
      name: '',
      phone: '',
      password: '',
      passwordConfirm: '',
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
        await ensureProfileRow(data.user.id, 'owner_driver', signup.name.trim(), signup.phone.trim())
      }
      showToast('회원가입이 완료되었습니다.')
      onSignup({
        name: signup.name.trim(),
        phone: signup.phone.trim(),
        accountType: 'owner_driver',
        inviteCode: '',
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
      <AuthIntroView
        onGuest={onGuest}
        onLogin={openLogin}
        onSignup={openSignup}
      />
    )
  }

  if (view === 'login') {
    return (
      <AuthLoginView
        login={login}
        setLogin={setLogin}
        loginReady={loginReady}
        busy={busy}
        onBack={() => setView('intro')}
        onForgotPassword={onForgotPassword}
        onSubmit={handleLogin}
      />
    )
  }

  return (
    <AuthSignupView
      signup={signup}
      setSignup={setSignup}
      signupReady={signupReady}
      busy={busy}
      onBack={() => setView('intro')}
      onSubmit={handleSignup}
    />
  )
}
