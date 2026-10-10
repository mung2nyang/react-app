// @ts-check
// 연동 중 기사 카드의 해제 영역 — 요청 없음: [해제 요청], 내가 요청: 대기 안내 + [요청 취소], 상대가 요청: 안내 + [동의]. 거절 버튼은 없다.
import { unlinkAutoDateLabel } from '../../lib/driverUnlink.js'

/**
 * @param {{
 *   driver: import('../../lib/outboxTypes.js').DriverRecord,
 *   meId: string,
 *   counterpartLabel: string,
 *   onAction: (action: import('../../lib/driverUnlink.js').UnlinkAction) => void,
 * }} props
 */
export default function DriverUnlinkControls({ driver, meId, counterpartLabel, onAction }) {
  const requestedBy = driver.unlinkRequestedBy || ''
  if (!requestedBy) {
    return <button type="button" className="driver-card-action-btn danger" onClick={() => onAction('request')}>해제 요청</button>
  }
  const due = unlinkAutoDateLabel(driver.unlinkRequestedAt)
  const dueText = due ? ` (${due} 자동 해제)` : ''
  if (requestedBy === meId) {
    return (
      <>
        <span className="car-sub-text driver-unlink-status">해제 요청 중 — {counterpartLabel} 동의 대기{dueText}</span>
        <button type="button" className="driver-card-action-btn" onClick={() => onAction('cancel')}>요청 취소</button>
      </>
    )
  }
  return (
    <>
      <span className="car-sub-text driver-unlink-status">{counterpartLabel}가 해제를 요청했습니다{dueText}</span>
      <button type="button" className="driver-card-action-btn danger" onClick={() => onAction('consent')}>동의</button>
    </>
  )
}
