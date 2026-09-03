// @ts-check
/** @typedef {import('../lib/outboxTypes.js').AppSession} AppSession */
import { useState } from 'react'
import { redeemDriverInviteCode } from '../lib/driverLinkRpc.js'
import { buildCloudAppSession, ownerKeyFromSession } from '../app/boot.js'
import { hydrateFromSupabase } from '../lib/hydrate.js'

/**
 * @param {{ session: AppSession|null, showToast?: (message: string) => void, onBack: () => void, onLinked: (session: AppSession) => void }} props
 */
export default function InviteRedeemPage({ session, showToast, onBack, onLinked }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const ready = code.trim().length >= 4 && !busy

  async function submit() {
    if (!ready || !session?.userId) return
    setBusy(true)
    try {
      await redeemDriverInviteCode(code)
      const next = await buildCloudAppSession(session.userId, {
        name: session.name,
        phone: session.phone,
      })
      try {
        await hydrateFromSupabase(session.userId, ownerKeyFromSession(next), { employedDriver: !!next.linkedOwnerId })
      } catch (error) {
        console.error(error)
        showToast?.('연동은 됐지만 클라우드 데이터를 일부 못 불러왔습니다.')
      }
      showToast?.('차주와 연동되었습니다.')
      onLinked(next)
    } catch (error) {
      const message = error instanceof Error ? error.message : '초대코드 연동에 실패했습니다.'
      showToast?.(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="settings-header">
        <button type="button" className="icon-btn" title="뒤로가기" onClick={onBack}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div className="settings-title">차주 연동</div>
        <span className="mypage-header-spacer" aria-hidden="true"></span>
      </div>

      <section className="personal-intro">
        <span className="personal-intro-kicker">DRIVER INVITE</span>
        <strong>차주가 알려준 초대코드를 입력하세요</strong>
        <p>연동이 끝나면 배정된 차량의 운행·매출을 볼 수 있습니다.</p>
      </section>

      <div className="auth-form-fields" style={{ padding: '0 16px' }}>
        <div className="auth-field">
          <label htmlFor="driverInviteCode">초대코드</label>
          <input
            id="driverInviteCode"
            className="auth-input-box"
            placeholder="초대코드"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={busy}
          />
        </div>
      </div>

      <div className="auth-bottom-sticky" style={{ padding: 16 }}>
        <button
          type="button"
          className={`auth-primary-btn${busy ? ' save-action-loading' : ''}`}
          disabled={!ready}
          onClick={submit}
        >
          연동하기
        </button>
      </div>
    </div>
  )
}