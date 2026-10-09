// @ts-check
// 구글 첫 로그인 기본 정보(구글 로그인 G-2): 이름·휴대전화 번호를 받아 profiles 행을 만든 뒤 첫 설정 화면으로.
import { useState } from 'react'
import { assetPath } from '../../lib/assetPath.js'
import { formatPhoneNumber } from '../../lib/formatPhone.js'
import ClearableInput from '../shared/ClearableInput.jsx'

const BANNER = assetPath('/images/banner_image.png')

/**
 * @param {Object} props
 * @param {string} [props.initialName] 구글 계정 이름(미리 채움)
 * @param {(fields: { name: string, phone: string }) => Promise<boolean>} props.onSubmit 성공하면 true
 */
export default function WelcomeProfileView({ initialName = '', onSubmit }) {
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const ready = name.trim() && phone.replace(/\D/g, '').length >= 10

  async function submit() {
    if (busy || !ready) return
    setBusy(true)
    const ok = await onSubmit({ name: name.trim(), phone: phone.trim() })
    if (!ok) setBusy(false)
  }

  return (
    <div className="account-flow-page">
      <div className="auth-view">
        <div className="auth-topbar">
          {/* 뒤로가기 버튼 자리(세 칸 구조라 비워 두면 로고가 좁은 첫 칸에 들어감) */}
          <span aria-hidden="true" />
          <div className="auth-brand-sm">
            <img src={BANNER} alt="" className="auth-logo-sm" />
            <span>운행일지</span>
          </div>
        </div>
        <div className="auth-heading-box">
          <h1>기본 정보</h1>
          <p className="auth-desc-text">이름과 휴대전화 번호를 입력하면 바로 시작할 수 있습니다.</p>
        </div>

        <div className="auth-form-fields">
          <div className="auth-field">
            <label htmlFor="welcomeName">이름</label>
            <ClearableInput
              id="welcomeName"
              className="auth-input-box"
              placeholder="이름을 입력하세요"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="welcomePhone">휴대전화 번호</label>
            <ClearableInput
              id="welcomePhone"
              type="tel"
              className="auth-input-box"
              placeholder="010-0000-0000"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
            />
          </div>
        </div>
        <div className="auth-bottom-sticky">
          <button
            type="button"
            className={`auth-primary-btn${busy ? ' save-action-loading' : ''}`}
            disabled={!ready || busy}
            onClick={() => { void submit() }}
          >
            시작하기
          </button>
        </div>
      </div>
    </div>
  )
}
