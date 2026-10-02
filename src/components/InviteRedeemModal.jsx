// @ts-check
/** @typedef {import('../lib/outboxTypes.js').AppSession} AppSession */
import { useState } from 'react'
import { redeemDriverInviteCode } from '../lib/driverLinkRpc.js'
import { buildCloudAppSession, ownerKeyFromSession } from '../app/boot.js'
import { hydrateFromSupabase } from '../lib/hydrate.js'
import './InviteRedeemModal.css'

/**
 * @param {{ session: AppSession|null, showToast?: (message: string) => void, onClose: () => void, onLinked: (session: AppSession) => void }} props
 */
export default function InviteRedeemModal({ session, showToast, onClose, onLinked }) {
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
    <div className="modal-overlay">
      <div className="modal-content client-modal invite-redeem-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">초대코드 입력</div>
        <p className="invite-redeem-note">
          차주에게 전달받은 초대코드를 입력해 주세요.<br />
          연동이 완료되면 기사님이 입력한 운행·매출 내역이 차주에게 공유됩니다.
        </p>
        <div className="form-group">
          <label htmlFor="driverInviteCode">초대코드</label>
          <input
            id="driverInviteCode"
            className="input-box"
            placeholder="초대코드"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="modal-btns">
          <button type="button" className="modal-btn cancel" disabled={busy} onClick={onClose}>취소</button>
          <button type="button" className="modal-btn confirm" disabled={!ready} onClick={submit}>{busy ? '연동 중…' : '연동하기'}</button>
        </div>
      </div>
    </div>
  )
}
