// @ts-check
// 알림 화면(🔔 → /app/notifications): 맨 위 "알림 받기" 종류별 스위치 + 알림 목록(날짜 줄·[닫기]). 옆 창(NotificationPanel)을 대체.
import { useMemo, useState } from 'react'
import { isCloudSession } from '../../lib/cloudSession.js'
import { collectNotifications, dismissNotification } from '../../lib/notifications.js'
import { savePracticeSettings } from '../../lib/practiceSettings.js'
import { useOwnerDrivers, useOwnerSettings } from '../../store/ownerDataHooks.js'
import PageHeader from '../PageHeader.jsx'
import './notifications-page.css'

/** @typedef {ReturnType<typeof collectNotifications>[number]} NotificationItem */

const SAVE_FAIL = '저장에 실패했습니다. 네트워크 상태를 확인해 주세요.'

/**
 * @param {Object} props
 * @param {string} props.ownerKey
 * @param {import('../../lib/outboxTypes.js').AppSession|null} [props.session]
 * @param {(message: string) => void} [props.showToast]
 * @param {() => void} props.onBack
 * @param {() => void} [props.onOpenMenu]
 * @param {(page: string) => void} props.onOpenPage 알림을 누르면 그 화면으로
 * @param {() => void} [props.onChanged] 닫기·끄기 뒤 🔔 숫자 다시 세기
 */
export default function NotificationsPage({ ownerKey, session, showToast, onBack, onOpenMenu, onOpenPage, onChanged }) {
  const settings = useOwnerSettings(ownerKey)
  const drivers = useOwnerDrivers(ownerKey)
  const [tick, setTick] = useState(0)
  const items = useMemo(() => collectNotifications(ownerKey, session), [ownerKey, session, settings, drivers, tick])
  const off = settings.notifOff || []
  const isGuest = ownerKey === 'guest' && !isCloudSession(session)
  const kinds = [
    { kind: 'overdue', label: '미수금 연체' },
    { kind: 'today', label: '오늘 운행일지 비어 있음', hint: '오후 6시 이후' },
    ...(!isGuest && !session?.linkedOwnerId ? [{ kind: 'driverInvite', label: '기사 초대 대기' }] : []),
    ...(isGuest ? [{ kind: 'backup', label: '백업 권장' }] : []),
  ]

  /** @param {string} kind @param {boolean} on */
  async function toggle(kind, on) {
    const next = on ? off.filter((name) => name !== kind) : [...off, kind]
    try {
      await savePracticeSettings(ownerKey, { notifOff: next })
      onChanged?.()
    } catch {
      showToast?.(SAVE_FAIL)
    }
  }

  /** @param {string} id */
  function dismiss(id) {
    dismissNotification(ownerKey, id)
    setTick((n) => n + 1)
    onChanged?.()
  }

  function turnOnInspection() {
    savePracticeSettings(ownerKey, { dailyInspectionOn: true })
      .then(() => { showToast?.('일상점검표를 켰습니다.'); onChanged?.() })
      .catch(() => showToast?.(SAVE_FAIL))
  }

  return (
    <div className="page notifications-page">
      <PageHeader title="알림" onBack={onBack} onOpenMenu={onOpenMenu} />

      <section className="notif-settings-card" aria-label="알림 받기">
        <p className="notif-settings-title">알림 받기</p>
        {kinds.map(({ kind, label, hint }) => (
          <div key={kind} className="notif-settings-row">
            <label htmlFor={`notif-${kind}`}>
              {label}
              {hint && <span className="notif-settings-hint">{hint}</span>}
            </label>
            <label className="switch">
              <input id={`notif-${kind}`} type="checkbox" checked={!off.includes(kind)} onChange={(e) => toggle(kind, e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>
        ))}
      </section>

      <div className="notif-list">
        {items.length === 0 && <div className="empty-state">새로운 알림이 없습니다.</div>}
        {items.map((/** @type {NotificationItem} */ item) => (
          <article key={item.id} className="notif-item">
            <button type="button" className="notif-item-copy" onClick={() => onOpenPage(item.page)}>
              <strong>{item.title}</strong>
              <span>{item.body}</span>
              {item.dateLabel && <span className="notif-item-date">{item.dateLabel}</span>}
            </button>
            <div className="notif-item-actions">
              {item.actionLabel && (
                <button type="button" className="notif-action-primary" onClick={turnOnInspection}>{item.actionLabel}</button>
              )}
              <button type="button" className="notif-action-dismiss" onClick={() => dismiss(item.id)}>{item.dismissLabel || '닫기'}</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
