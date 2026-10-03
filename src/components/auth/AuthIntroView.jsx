// @ts-check
import { assetPath } from '../../lib/assetPath.js'

const BANNER = assetPath('/images/banner_image.png')

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
            <button type="button" className="auth-primary-btn" disabled={busy} onClick={onGoogle}>Google로 시작하기</button>
          </div>
          <button type="button" className="auth-guest-btn" onClick={onGuest}>비회원으로 시작하기</button>
        </div>
      </div>
    </div>
  )
}
